import cron from 'node-cron'
import { Pool } from 'pg'
import * as crypto from 'crypto'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const EDC_URL = process.env.EDC_MOCK_URL ?? 'http://api:4000/mock-edc'
const INTERVAL = parseInt(process.env.POLL_INTERVAL_SECONDS ?? '60')

// Exponential backoff helper
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (attempt === maxRetries) throw err
      const backoff = Math.min(1000 * 2 ** attempt, 30000)
      console.warn(`EDC fetch attempt ${attempt} failed, retrying in ${backoff}ms:`, err)
      await delay(backoff)
    }
  }
  throw new Error('All retries exhausted')
}

async function writeAuditLog(tableName: string, rowId: string, action: string, actor: string) {
  await pool.query(
    'INSERT INTO audit_log (table_name, row_id, action, actor) VALUES ($1, $2, $3, $4)',
    [tableName, rowId, action, actor]
  )
}

async function pollEDC() {
  console.log(`[worker] Polling EDC at ${new Date().toISOString()}`)
  try {
    const res = await fetchWithRetry(EDC_URL)
    const { records } = await res.json() as { records: Array<{ subject_id: string; note: string; visit: string }> }

    for (const record of records) {
      const inputHash = crypto.createHash('sha256')
        .update(JSON.stringify(record))
        .digest('hex')
        .slice(0, 64)

      // Skip records we have already processed (idempotent polling)
      const { rows: existing } = await pool.query(
        'SELECT id FROM agent_runs WHERE input_hash = $1',
        [inputHash]
      )
      if (existing.length > 0) continue

      // Persist the raw source record
      const { rows: [src] } = await pool.query(
        `INSERT INTO source_records (system, subject_id, raw_json)
         VALUES ('mock_edc', $1, $2) RETURNING id`,
        [record.subject_id, JSON.stringify(record)]
      )

      await writeAuditLog('source_records', src.id, 'INSERT', 'worker')
      console.log(`[worker] Ingested new record for subject ${record.subject_id}`)
    }
  } catch (err) {
    console.error('[worker] EDC poll failed:', err)
  }
}

// Run immediately on startup, then on schedule
await pollEDC()

const cronExpr = `*/${INTERVAL} * * * * *`   // every N seconds (for demo — use minutes in production)
cron.schedule(cronExpr, pollEDC)

console.log(`[worker] HITL queue worker started. Polling EDC every ${INTERVAL}s.`)
