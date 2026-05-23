/**
 * HITLConfidenceGate — reusable HITL escalation pattern
 *
 * Validated in 3 Agent Studio deployments. Zero build-specific dependencies.
 * Drop into any agent workflow that produces a numeric confidence score.
 */

import { randomUUID } from 'crypto'

export interface AgentOutput {
  confidence:  number
  field_type?: string
  status?:     string
  [key: string]: unknown
}

export interface HITLTask {
  task_id:    string
  output:     AgentOutput
  field_type: string
  created_at: string
}

export interface HITLDecision {
  task_id:     string
  decision:    'approved' | 'rejected'
  reviewer_id: string
  notes?:      string
  decided_at:  string
}

export interface ReviewQueue {
  push(task: HITLTask): Promise<void>
  waitForDecision(taskId: string): Promise<HITLDecision>
}

export interface AuditLog {
  write(entry: {
    table_name: string
    row_id:     string
    action:     string
    actor:      string
  }): Promise<void>
}

export interface HITLGateConfig {
  thresholds:  Record<string, number>   // per field_type, e.g. { adverse_event: 0.92 }
  reviewQueue: ReviewQueue
  auditLog:    AuditLog
  defaultThreshold?: number             // fallback if field_type has no specific threshold
}

export interface GateResult {
  task_id:           string
  confidence:        number
  field_type:        string
  threshold:         number
  routed_to_review:  boolean
  decision?:         HITLDecision
}

export class HITLConfidenceGate {
  private config: HITLGateConfig

  constructor(config: HITLGateConfig) {
    this.config = config
  }

  /**
   * Check an agent output against the threshold for its field type.
   *
   * If confidence >= threshold: returns immediately with routed_to_review = false.
   * If confidence < threshold:  pushes to the review queue, suspends until a human
   *                             decides, writes the decision to the audit log, and
   *                             returns the decision.
   *
   * This function is the single location where HITL routing happens.
   * It never modifies the agent output — it only routes and logs.
   */
  async check(output: AgentOutput): Promise<GateResult> {
    const fieldType = output.field_type ?? 'default'
    const threshold = this.config.thresholds[fieldType]
      ?? this.config.defaultThreshold
      ?? 0.90

    const taskId = randomUUID()

    const result: GateResult = {
      task_id:          taskId,
      confidence:       output.confidence,
      field_type:       fieldType,
      threshold,
      routed_to_review: false,
    }

    // Above threshold — no human review needed
    if (output.confidence >= threshold) {
      await this.config.auditLog.write({
        table_name: 'agent_runs',
        row_id:     taskId,
        action:     'INSERT',
        actor:      'hitl_gate:auto_approved',
      })
      return result
    }

    // Below threshold — route to human review queue and wait
    const task: HITLTask = {
      task_id:    taskId,
      output,
      field_type: fieldType,
      created_at: new Date().toISOString(),
    }

    await this.config.reviewQueue.push(task)
    result.routed_to_review = true

    // Suspend until the human decides (the review queue handles the wait mechanism)
    const decision = await this.config.reviewQueue.waitForDecision(taskId)
    result.decision = decision

    // Write the decision to the immutable audit log
    await this.config.auditLog.write({
      table_name: 'hitl_decisions',
      row_id:     taskId,
      action:     'INSERT',
      actor:      decision.reviewer_id,
    })

    return result
  }
}
