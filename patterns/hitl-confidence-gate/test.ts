/**
 * Unit tests for HITLConfidenceGate pattern
 * Run: npx jest patterns/hitl-confidence-gate/test.ts
 */

import { HITLConfidenceGate } from './index'

// ── Mock dependencies ─────────────────────────────────────────────────────────

function makeMocks() {
  const queuedTasks: any[] = []
  const auditEntries: any[] = []

  const reviewQueue = {
    push: jest.fn(async (task) => { queuedTasks.push(task) }),
    waitForDecision: jest.fn(async (taskId) => ({
      task_id:     taskId,
      decision:    'approved' as const,
      reviewer_id: 'test-reviewer',
      notes:       'Looks correct',
      decided_at:  new Date().toISOString(),
    })),
  }

  const auditLog = {
    write: jest.fn(async (entry) => { auditEntries.push(entry) }),
  }

  return { reviewQueue, auditLog, queuedTasks, auditEntries }
}

const thresholds = {
  adverse_event: 0.92,
  protocol_dev:  0.95,
  site_note:     0.70,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('1. Auto-approves when confidence meets the threshold', async () => {
  const { reviewQueue, auditLog } = makeMocks()
  const gate = new HITLConfidenceGate({ thresholds, reviewQueue, auditLog })

  const result = await gate.check({ confidence: 0.96, field_type: 'adverse_event' })

  expect(result.routed_to_review).toBe(false)
  expect(reviewQueue.push).not.toHaveBeenCalled()
  expect(auditLog.write).toHaveBeenCalledTimes(1)
  expect(auditLog.write.mock.calls[0][0].actor).toContain('auto_approved')
})

test('2. Routes to review queue when confidence is below threshold', async () => {
  const { reviewQueue, auditLog } = makeMocks()
  const gate = new HITLConfidenceGate({ thresholds, reviewQueue, auditLog })

  const result = await gate.check({ confidence: 0.71, field_type: 'adverse_event' })

  expect(result.routed_to_review).toBe(true)
  expect(reviewQueue.push).toHaveBeenCalledTimes(1)
  expect(reviewQueue.waitForDecision).toHaveBeenCalledWith(result.task_id)
})

test('3. Writes audit log entry after every human decision', async () => {
  const { reviewQueue, auditLog } = makeMocks()
  const gate = new HITLConfidenceGate({ thresholds, reviewQueue, auditLog })

  await gate.check({ confidence: 0.60, field_type: 'adverse_event' })

  expect(auditLog.write).toHaveBeenCalledTimes(1)
  const entry = auditLog.write.mock.calls[0][0]
  expect(entry.table_name).toBe('hitl_decisions')
  expect(entry.actor).toBe('test-reviewer')
})

test('4. Uses per-field threshold — different fields have different thresholds', async () => {
  const { reviewQueue, auditLog } = makeMocks()
  const gate = new HITLConfidenceGate({ thresholds, reviewQueue, auditLog })

  // 0.80 is above site_note threshold (0.70) but below adverse_event threshold (0.92)
  const siteResult = await gate.check({ confidence: 0.80, field_type: 'site_note' })
  expect(siteResult.routed_to_review).toBe(false)   // site_note: auto-approved

  const aeResult = await gate.check({ confidence: 0.80, field_type: 'adverse_event' })
  expect(aeResult.routed_to_review).toBe(true)      // adverse_event: requires review
})

test('5. Falls back to defaultThreshold when field_type has no specific config', async () => {
  const { reviewQueue, auditLog } = makeMocks()
  const gate = new HITLConfidenceGate({
    thresholds,
    reviewQueue,
    auditLog,
    defaultThreshold: 0.85,
  })

  // 0.80 is below the default threshold (0.85) — should route to review
  const result = await gate.check({ confidence: 0.80, field_type: 'unknown_field_type' })
  expect(result.routed_to_review).toBe(true)
  expect(result.threshold).toBe(0.85)
})
