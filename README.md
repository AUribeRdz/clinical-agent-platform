# Medable Interview Demo — Clinical Agent Platform

A working full-stack demo covering all three interview rounds.
Run the entire stack with one command.

## Quick start

```bash
# 1. Copy env file and add your Anthropic API key
cp .env.example .env

# 2. Start all services
docker-compose up --build

# 3. Verify everything is healthy
curl localhost:4000/health
# → {"status":"ok","db":"connected","worker":"running"}

# 4. Open the HITL reviewer UI
open http://localhost:3000
```

## What is running

| Service   | Port | Purpose                                      |
|-----------|------|----------------------------------------------|
| api       | 4000 | Fastify REST API — EDC polling, agent output, HITL queue |
| frontend  | 3000 | React reviewer UI — approve/reject agent outputs |
| db        | 5432 | Postgres — all tables including append-only audit_log |
| worker    | —    | Background worker — polls EDC every 60s, processes queue |

## Demo scripts (run after docker-compose up)

```bash
# Seed the DB with sample agent runs (shows confidence scores)
npm run seed --prefix api

# Submit a test subject and trigger the HITL gate
curl -X POST localhost:4000/subjects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-token" \
  -d '{"subject_id":"SUB-001","note":"Patient reported headache onset 2026-05-01"}'

# See the HITL queue (low-confidence items awaiting review)
curl localhost:4000/hitl/queue \
  -H "Authorization: Bearer demo-token"
```

## Interview talking points per service

### Round 1 — Engineering
- `docker-compose.yml` — four services, health checks, named volumes, no hardcoded secrets
- `api/src/server.ts` — Fastify with JWT middleware on every protected route
- `api/src/poller.ts` — node-cron polling loop with exponential backoff retry
- `db/migrations/` — numbered, sequential, append-only audit_log design
- `api/src/audit.ts` — INSERT-only audit trail (no UPDATE, no DELETE) — 21 CFR Part 11

### Round 2 — Agentic AI
- `mcp-server/` — TypeScript MCP server, wire to Claude Desktop
- `prompts/v1.2.3/ae_extractor.txt` — GxP-defensible prompt (ROLE/TASK/OUTPUT/UNCERTAINTY/PROHIBITED)
- `api/src/agent.ts` — confidence scoring, HITL gate logic, threshold config

### Round 3 — Quality
- `tests/` — 16-test Jest suite (happy path, edge, adversarial, integration)
- `patterns/hitl-confidence-gate/` — reusable pattern with README, implementation, tests
