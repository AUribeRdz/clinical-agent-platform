import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import { pool } from './db'
import { writeAuditLog } from './audit'
import { getThresholds } from './thresholds'
import { runAgent } from './agent'

const app = Fastify({ logger: true })

const mockEDCRecords = [
  { subject_id: 'SUB-001', note: 'Patient reported headache onset 2026-05-01. Severity mild.', visit: 'V2' },
  { subject_id: 'SUB-002', note: 'Nausea following dose 3. Onset 2026-05-10. Resolved same day.', visit: 'V3' },
  { subject_id: 'SUB-003', note: 'Site monitoring visit completed. No protocol deviations.', visit: 'V1' },
  { subject_id: 'SUB-004', note: 'Subject possibly missed dose — unclear from notes.', visit: 'V4' },
]

async function main() {
  await app.register(fastifyCors, { origin: true })

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'demo-secret-change-in-production',
  })

  app.addHook('onRequest', async (request, reply) => {
    const open = ['GET /health', 'GET /mock-edc']
    const key = `${request.method} ${request.routerPath ?? request.url}`
    if (open.some(r => key.startsWith(r))) return
    const header = request.headers.authorization ?? ''
    if (header === 'Bearer demo-token') return
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/health', async () => {
    const db = await pool.query('SELECT 1').then(() => 'connected').catch(() => 'error')
    return { status: 'ok', db, worker: 'running', version: '1.0.0' }
  })

  app.get('/mock-edc', async () => ({ records: mockEDCRecords }))

  app.post('/subjects', async (request, reply) => {
    const { subject_id, note } = request.body as { subject_id: string; note: string }
    if (!subject_id || !note) {
      return reply.code(400).send({ error: 'subject_id and note are required' })
    }
    const { rows: [record] } = await pool.query(
      `INSERT INTO source_records (system, subject_id, raw_json)
       VALUES ('api_submission', $1, $2) RETURNING id`,
      [subject_id, JSON.stringify({ note, submitted_at: new Date().toISOString() })]
    )
    await writeAuditLog('source_records', record.id, 'INSERT', 'api')
    const agentOutput = await runAgent(note, 'adverse_event')
    const thresholds = getThresholds()
    const threshold = thresholds[agentOutput.field_type ?? 'adverse_event'] ?? 0.90
    const status = agentOutput.confidence >= threshold ? 'approved' : 'requires_review'
    const { rows: [run] } = await pool.query(
      `INSERT INTO agent_runs
         (record_id, prompt_version_hash, input_hash, output_json, confidence, status, field_type, triggered_by)
       VALUES ($1, $2, md5($3), $4, $5, $6, $7, $8)
       RETURNING id, status, confidence`,
      [record.id, agentOutput.prompt_version, note, JSON.stringify(agentOutput),
       agentOutput.confidence, status, agentOutput.field_type, 'api']
    )
    await writeAuditLog('agent_runs', run.id, 'INSERT', 'api')
    return {
      run_id: run.id, status: run.status, confidence: run.confidence,
      output: agentOutput, hitl_required: status === 'requires_review', threshold_used: threshold,
    }
  })

  app.get('/hitl/queue', async () => {
    const { rows } = await pool.query(
      `SELECT ar.id, ar.confidence, ar.field_type, ar.output_json, ar.run_at,
              sr.subject_id, sr.raw_json as source_data
       FROM agent_runs ar
       JOIN source_records sr ON sr.id = ar.record_id
       WHERE ar.status = 'requires_review'
       ORDER BY ar.run_at DESC LIMIT 50`
    )
    return { queue: rows, count: rows.length }
  })

  app.post('/hitl/:run_id/decide', async (request, reply) => {
    const { run_id } = request.params as { run_id: string }
    const { decision, notes, reviewer_id } = request.body as {
      decision: 'approved' | 'rejected'; notes: string; reviewer_id: string
    }
    if (!['approved', 'rejected'].includes(decision)) {
      return reply.code(400).send({ error: 'decision must be approved or rejected' })
    }
    if (decision === 'rejected' && !notes?.trim()) {
      return reply.code(400).send({ error: 'notes are required when rejecting' })
    }
    const { rows: [run] } = await pool.query(
      'SELECT id, status FROM agent_runs WHERE id = $1', [run_id]
    )
    if (!run) return reply.code(404).send({ error: 'Run not found' })
    if (run.status !== 'requires_review') {
      return reply.code(409).send({ error: `Run is already ${run.status}` })
    }
    const { rows: [dec] } = await pool.query(
      `INSERT INTO hitl_decisions (run_id, reviewer_id, decision, notes)
       VALUES ($1, $2, $3, $4) RETURNING id, decided_at`,
      [run_id, reviewer_id ?? 'demo-reviewer', decision, notes ?? null]
    )
    await pool.query('UPDATE agent_runs SET status = $1 WHERE id = $2', [decision, run_id])
    await writeAuditLog('hitl_decisions', dec.id, 'INSERT', reviewer_id ?? 'demo-reviewer')
    return { decision_id: dec.id, run_id, decision, decided_at: dec.decided_at }
  })

  app.get('/audit', async (request) => {
    const { limit = '50', table_name } = request.query as { limit?: string; table_name?: string }
    let query = 'SELECT * FROM audit_log'
    const params: string[] = []
    if (table_name) { query += ' WHERE table_name = $1'; params.push(table_name) }
    query += ` ORDER BY ts DESC LIMIT ${Math.min(parseInt(limit), 500)}`
    const { rows } = await pool.query(query, params)
    return { audit_log: rows, count: rows.length }
  })

  try {
    await app.listen({ port: 4000, host: '0.0.0.0' })
    console.log('API listening on port 4000')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()