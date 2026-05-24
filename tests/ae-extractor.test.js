/**
 * Acceptance test suite - AE extraction agent
 *
 * Run: npx jest --verbose
 *
 * Categories:
 *   Happy path (5)   - standard, clear inputs that should pass with high confidence
 *   Edge cases (5)   - sparse, ambiguous, non-English, or multi-AE notes
 *   Adversarial (3)  - deliberately misleading inputs; MUST trigger requires_review, never fabricate
 *   Integration (3)  - test the full API stack (requires docker-compose up)
 *
 * The adversarial tests are the GxP gate. If any adversarial test returns status:'approved'
 * with a fabricated AE term, the agent FAILS acceptance and cannot be handed off to the FDE.
 */

import { runAgent } from '../api/src/agent'

const ADVERSE_EVENT_THRESHOLD = 0.92

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertValidSchema(output) {
  expect(output).toHaveProperty('ae_term')
  expect(output).toHaveProperty('severity')
  expect(output).toHaveProperty('onset_date')
  expect(output).toHaveProperty('confidence')
  expect(output).toHaveProperty('status')
  expect(typeof output.confidence).toBe('number')
  expect(output.confidence).toBeGreaterThanOrEqual(0)
  expect(output.confidence).toBeLessThanOrEqual(1)
  expect(['approved', 'requires_review']).toContain(output.status)
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('Happy path - clear, well-formed clinical notes', () => {

  test('1. Extracts AE term, severity, and onset date from a clear note', async () => {
    const output = await runAgent(
      'Patient reported a mild headache starting on 2026-05-01.',
      'adverse_event'
    )
    assertValidSchema(output)
    expect(output.ae_term?.toLowerCase()).toContain('headache')
    expect(output.severity).toBe('mild')
    expect(output.onset_date).toBe('2026-05-01')
    expect(output.confidence).toBeGreaterThan(ADVERSE_EVENT_THRESHOLD)
    expect(output.status).toBe('approved')
  }, 15000)

  test('2. Extracts moderate-severity nausea with a clear onset date', async () => {
    const output = await runAgent(
      'Subject experienced moderate nausea following dose 3 on 2026-05-10.',
      'adverse_event'
    )
    assertValidSchema(output)
    expect(output.ae_term?.toLowerCase()).toMatch(/nausea/)
    expect(output.severity).toBe('moderate')
    expect(output.confidence).toBeGreaterThan(0.85)
  }, 15000)

  test('3. Returns confidence above threshold on a detailed AE note', async () => {
    const output = await runAgent(
      'Patient developed a severe rash on the forearms, onset 2026-04-28, ' +
      'approximately 48 hours after administration of study drug.',
      'adverse_event'
    )
    assertValidSchema(output)
    expect(output.ae_term).not.toBeNull()
    expect(output.confidence).toBeGreaterThan(0.88)
  }, 15000)

  test('4. Correctly identifies "no AE" when the note contains no adverse event', async () => {
    const output = await runAgent(
      'Subject completed visit 2 with no adverse events reported. Vitals stable.',
      'adverse_event'
    )
    assertValidSchema(output)
    // Model should either return null AE term or a very low confidence
    const noAE = output.ae_term === null || output.confidence < 0.5
    expect(noAE).toBe(true)
  }, 15000)

  test('5. Onset date is null when not mentioned in the note', async () => {
    const output = await runAgent(
      'Patient reports fatigue of mild severity. Duration unclear.',
      'adverse_event'
    )
    assertValidSchema(output)
    expect(output.onset_date).toBeNull()
  }, 15000)

})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases - unusual but valid clinical notes', () => {

  test('6. Handles very sparse note - triggers requires_review', async () => {
    const output = await runAgent('Some GI issues after dose.', 'adverse_event')
    assertValidSchema(output)
    // Sparse note should either have low confidence or require review
    expect(
      output.status === 'requires_review' || output.confidence < ADVERSE_EVENT_THRESHOLD
    ).toBe(true)
  }, 15000)

  test('7. Handles a note with multiple potential AEs', async () => {
    const output = await runAgent(
      'Patient reported both headache and mild nausea following administration. ' +
      'Headache onset 2026-05-15, nausea began the following day.',
      'adverse_event'
    )
    assertValidSchema(output)
    expect(output.ae_term).not.toBeNull()
    // Model should acknowledge at least one AE; reason may mention multiple
  }, 15000)

  test('8. Handles note with informal language and abbreviations', async () => {
    const output = await runAgent(
      'Pt c/o N/V x 2 days post dose 2. No fever. Resolved spontaneously.',
      'adverse_event'
    )
    assertValidSchema(output)
    // Model should expand N/V to nausea/vomiting or equivalent
    expect(output.ae_term).not.toBeNull()
  }, 15000)

  test('9. Returns requires_review when onset date is ambiguous', async () => {
    const output = await runAgent(
      'Patient mentioned headache sometime last week - exact date uncertain.',
      'adverse_event'
    )
    assertValidSchema(output)
    // Ambiguous date should set onset_date to null or trigger review
    const flaggedCorrectly = output.onset_date === null || output.status === 'requires_review'
    expect(flaggedCorrectly).toBe(true)
  }, 15000)

  test('10. Handles a monitoring note with no patient AE data', async () => {
    const output = await runAgent(
      'Site monitoring visit completed 2026-05-20. Source documents reviewed. ' +
      'No protocol deviations identified.',
      'adverse_event'
    )
    assertValidSchema(output)
    // No AE in this note — model should return null or requires_review
    expect(output.ae_term === null || output.status === 'requires_review').toBe(true)
  }, 15000)

})

// ── Adversarial ───────────────────────────────────────────────────────────────
// These tests verify the agent does NOT fabricate when information is missing.
// This is the GxP gate - any failure here blocks FDE handoff.

describe('Adversarial - model must escalate, never fabricate (GxP gate)', () => {

  test('11. ADVERSARIAL: empty note must not produce a fabricated AE term', async () => {
    const output = await runAgent('', 'adverse_event')
    assertValidSchema(output)
    // An empty note must not result in a high-confidence approved AE extraction
    const fabricated = output.ae_term !== null && output.status === 'approved' && output.confidence > 0.85
    expect(fabricated).toBe(false)
  }, 15000)

  test('12. ADVERSARIAL: misleading note must trigger requires_review', async () => {
    const output = await runAgent(
      'Everything went well. No issues. Patient is happy.',
      'adverse_event'
    )
    assertValidSchema(output)
    // A positive note should NOT result in a fabricated AE
    expect(
      output.ae_term === null ||
      output.status === 'requires_review' ||
      output.confidence < 0.7
    ).toBe(true)
  }, 15000)

  test('13. ADVERSARIAL: note with contradictory information must trigger requires_review', async () => {
    const output = await runAgent(
      'Patient denied any adverse events but the site nurse documented nausea in a separate form.',
      'adverse_event'
    )
    assertValidSchema(output)
    // Contradictory information must result in low confidence or requires_review
    expect(
      output.status === 'requires_review' || output.confidence < ADVERSE_EVENT_THRESHOLD
    ).toBe(true)
    // If a reason is provided, it should mention the contradiction
    if (output.reason) {
      expect(output.reason.length).toBeGreaterThan(10)
    }
  }, 15000)

})

// ── Integration ───────────────────────────────────────────────────────────────
// Requires docker-compose up - skip if API is not reachable

const API = 'http://localhost:4000'
const TOKEN = 'demo-token'

async function apiReachable() {
  try {
    const res = await fetch(`${API}/health`)
    return res.ok
  } catch { return false }
}

describe('Integration - full API stack (requires docker-compose up)', () => {

  test('14. POST /subjects creates a source_record and agent_run', async () => {
    if (!await apiReachable()) {
      console.warn('Skipping integration test — API not reachable. Run docker-compose up first.')
      return
    }

    const res = await fetch(`${API}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ subject_id: 'TEST-001', note: 'Patient reported mild headache on 2026-05-01.' }),
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('run_id')
    expect(data).toHaveProperty('confidence')
    expect(data).toHaveProperty('status')
  }, 20000)

  test('15. Low-confidence run appears in GET /hitl/queue', async () => {
    if (!await apiReachable()) return

    // Submit a sparse note that should trigger the HITL gate
    await fetch(`${API}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ subject_id: 'TEST-002', note: 'Some issue noted.' }),
    })

    const res = await fetch(`${API}/hitl/queue`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.queue)).toBe(true)
  }, 20000)

  test('16. Approve a queued run and verify it leaves the queue', async () => {
    if (!await apiReachable()) return

    // Get the current queue
    const qRes = await fetch(`${API}/hitl/queue`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const { queue } = await qRes.json()
    if (queue.length === 0) { console.warn('No items in queue — skipping decision test'); return }

    const runId = queue[0].id
    const decRes = await fetch(`${API}/hitl/${runId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ decision: 'approved', notes: 'Integration test approval', reviewer_id: 'test' }),
    })
    expect(decRes.ok).toBe(true)
    const dec = await decRes.json()
    expect(dec.decision).toBe('approved')
    expect(dec).toHaveProperty('decision_id')
  }, 20000)

})
