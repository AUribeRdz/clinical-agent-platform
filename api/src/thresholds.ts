/**
 * HITL confidence thresholds — loaded from environment variables at startup.
 *
 * Each field type can have its own threshold because risk levels differ:
 * - adverse_event requires very high confidence (0.92) because a missed AE
 *   is a patient safety issue.
 * - protocol_dev is highest (0.95) because deviations have regulatory consequences.
 * - site_note is lower (0.70) because these are informational only.
 *
 * This object is the single source of truth used by both the API and the worker.
 * It is version-controlled as part of the codebase — changes require a code review
 * and a new deployment, which creates an audit trail.
 */
export interface Thresholds {
  adverse_event: number
  protocol_dev: number
  site_note: number
  [key: string]: number
}

export function getThresholds(): Thresholds {
  return {
    adverse_event: parseFloat(process.env.CONFIDENCE_THRESHOLD_ADVERSE_EVENT ?? '0.92'),
    protocol_dev:  parseFloat(process.env.CONFIDENCE_THRESHOLD_PROTOCOL_DEV  ?? '0.95'),
    site_note:     parseFloat(process.env.CONFIDENCE_THRESHOLD_SITE_NOTE     ?? '0.70'),
  }
}
