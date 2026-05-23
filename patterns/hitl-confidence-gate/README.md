# Pattern: HITL Confidence Gate

## Problem

Agent outputs need human review when confidence is below a defined threshold.
Routing, pausing, and logging must happen consistently across every agent deployment.
Without a shared pattern, each build re-implements this logic differently — creating
inconsistent audit trails and threshold configurations.

## When to use

Use this pattern whenever an LLM agent produces a numeric confidence score and you need to:
- Route low-confidence outputs to a human review queue
- Suspend the workflow until a human decision is recorded
- Write an immutable decision to the audit log before proceeding

## What it does NOT do

- It does not call the LLM — call your agent first, then pass the output here
- It does not implement the reviewer UI — that is a separate concern
- It does not enforce specific threshold values — those come from your config

## Configuration

```typescript
const gate = new HITLConfidenceGate({
  thresholds: {
    adverse_event: 0.92,   // high — patient safety
    protocol_dev:  0.95,   // highest — regulatory consequence
    site_note:     0.70,   // lower — informational only
  },
  reviewQueue,   // any object with a push(task) method
  auditLog,      // any object with a write(entry) method
})
```

## Example

```typescript
import { HITLConfidenceGate } from './index'

const agentOutput = await runAgent(note, 'adverse_event')

const result = await gate.check(agentOutput)

if (result.routed_to_review) {
  console.log(`Run ${result.task_id} is waiting for human review`)
} else {
  console.log(`Run approved automatically — confidence ${result.confidence}`)
}
```

## Validated in

- CRA Agent demo build (clinical-agent-platform / api)
- TMF monitoring workflow prototype
- AE extraction batch processor

## Files

- `index.ts`   — reusable implementation
- `example.ts` — usage inside a real agent workflow
- `test.ts`    — unit tests (run with `npx jest patterns/hitl-confidence-gate/test.ts`)
