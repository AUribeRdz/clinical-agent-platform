# Clinical Agent Platform

A full-stack agentic AI platform for regulated clinical-trial data, built around a human-in-the-loop confidence gate, an append-only audit trail and versioned, tested prompts.

## Overview

An LLM extracts adverse-event details from free-text clinical notes. The model never has the final say: a deterministic, per-field confidence gate decides whether a result is accepted or routed to a human reviewer, and every step is recorded in an append-only Postgres audit trail.

The patterns here (audit trails, review gates, versioned prompts, governance guardrails) apply to any enterprise GenAI deployment, not only healthcare. The project demonstrates patterns aligned with GxP and 21 CFR Part 11 principles; it is not a validated, compliant system.

## What this demonstrates

| Capability | Location |
| --- | --- |
| Versioned, tested GxP prompt library | `GxP_prompts/` |
| HITL confidence gate with per-field thresholds | `api/src/server.ts`, `api/src/thresholds.ts` |
| Append-only Postgres audit trail | `db/migrations/001_init.sql` |
| MCP connector (eTMF tools for Claude Desktop) | `mcp-server/` |
| Acceptance tests (16, including adversarial) | `tests/` |
| Reusable HITL gate pattern | `patterns/hitl-confidence-gate/` |
| Four-service Docker Compose stack with health checks | `docker-compose.yml` |

## Architecture

1. A clinical note arrives through `POST /subjects` (or the worker polling a mock EDC endpoint).
2. The source record is stored and the agent extracts `ae_term`, `severity`, `onset_date` and a `confidence` score as strict JSON.
3. The API compares confidence with the threshold for the field type. Below the threshold, the run is set to `requires_review` and appears in `GET /hitl/queue`.
4. A reviewer approves or rejects through `POST /hitl/:run_id/decide` (the reviewer UI on port 3000). Rejections require notes, and a run that has already been decided returns 409.
5. Every read and write is logged to `audit_log`; the database blocks updates and deletes on that table. `agent_runs` is insert-only except for one transition: its status changes from `requires_review` to `approved` or `rejected` after a human decision, which is stored in `hitl_decisions` and `audit_log`.

If the model returns invalid JSON, the run is recorded with confidence 0 and sent to review.

### Confidence thresholds

| Field type | Threshold | Rationale |
| --- | --- | --- |
| `adverse_event` | 0.92 | Patient safety |
| `protocol_dev` | 0.95 | Regulatory consequence |
| `site_note` | 0.70 | Informational only |

Thresholds can be overridden with environment variables (see `.env.example`).

## GxP prompt engineering

`GxP_prompts/` holds versioned system prompts for adverse-event extraction, with test cases and a changelog. Prompts are treated as software artifacts: version-controlled, tested against known cases and changelogged with root cause. Version 1.2.4 is current; it fixed extended-thinking models writing prose before the JSON object. See [GxP_prompts/README.md](GxP_prompts/README.md).

The API loads the version named by `PROMPT_VERSION` (default `v1.2.4`) from `GxP_prompts/`, which docker-compose mounts read-only into the container. If the file cannot be read, the API refuses to start instead of falling back to an unversioned prompt. Every agent run stores `<version>:<SHA-256 prefix of the file>` in `agent_runs.prompt_version_hash`. Line endings are normalized before hashing, so the value is the same on Windows, macOS and Linux.

## Tech stack

| Area | Tools |
| --- | --- |
| API | Node.js, TypeScript, Fastify, JWT |
| Frontend | React |
| Database | PostgreSQL 15 |
| Worker | node-cron, retry with exponential backoff |
| AI | Anthropic Claude API, Model Context Protocol (MCP) |
| Testing and delivery | Jest, Docker Compose |

## Quick start

```bash
cp .env.example .env
# Add your Anthropic API key to .env
docker-compose up --build
```

- API: `http://localhost:4000`
- Reviewer UI: `http://localhost:3000`

## Tests

The acceptance suite (16 tests in `tests/`) and the 5 pattern tests in `patterns/` run with Jest from the `api/` folder:

```bash
cd api
npm ci
export ANTHROPIC_API_KEY=your-key    # tests 1 to 13 call the Claude API
npm test
```

Tests 14 to 16 exercise the running stack, so they are **skipped** unless you opt in:

```bash
docker-compose up -d
RUN_INTEGRATION=1 npm test
```

With `RUN_INTEGRATION=1` an unreachable API is a failure, not a silent pass. The three adversarial tests (11 to 13) are the gate: if any of them returns `approved` with a fabricated adverse event, the agent fails acceptance.

## Known limitations

- The API accepts a demo bearer token when `NODE_ENV` is not `production`; it exists for local runs and the demo UI only. Production mode requires a real `JWT_SECRET` and rejects the demo token.
- Audit writes are logged on failure rather than blocking the request.
- The status change on a reviewed run is recorded through `hitl_decisions`, but `audit_log` does not yet have its own entry for it.
- Database rules enforce immutability for ordinary use; a production system would also use role permissions and stricter controls.
- No PHI handling, rate limiting or cost controls.

## Skills demonstrated

Agentic AI architecture, responsible AI, human-in-the-loop design, prompt engineering and change control, audit and compliance patterns, full-stack development, Docker, automated testing.
