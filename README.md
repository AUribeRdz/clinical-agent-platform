# Clinical Agent Platform

Full-stack agentic AI platform for regulated clinical trial deployments,
built to GxP quality standards with Human-in-the-Loop oversight,
append-only audit trails, and versioned prompt engineering.

## What this demonstrates

| Capability | Location |
|---|---|
| GxP prompt engineering - versioned, auditable, tested | `GxP_prompts/` |
| HITL confidence gate - per-field thresholds, audit log | `api/src/agent.ts` |
| Postgres audit trail - INSERT only, 21 CFR Part 11 | `db/migrations/001_init.sql` |
| MCP connector - eTMF tool integration for Claude Desktop | `mcp-server/` |
| Acceptance test suite - 16 tests including adversarial GxP gate | `tests/` |
| Reusable pattern library - HITL confidence gate | `patterns/` |
| Full Docker Compose stack - 4 services, health checks | `docker-compose.yml` |

## Quick start

```bash
cp .env.example .env
# Add your Anthropic API key to .env
docker-compose up --build
# API running at localhost:4000
# HITL reviewer UI at localhost:3000
```

## GxP prompt engineering

The `GxP_prompts/` folder contains versioned agent system prompts
for clinical adverse event extraction, with test cases and changelog.
Prompts are treated as software artifacts - version-controlled,
tested against a golden dataset, and approved before deployment.

See [GxP_prompts/README.md](GxP_prompts/README.md) for full documentation.

## Stack

Node.js · Fastify · React · Postgres · Docker ·
Anthropic Claude API · Model Context Protocol (MCP) · Jest

## Confidence threshold reference

| Field type | Threshold | Rationale |
|---|---|---|
| adverse_event | 0.92 | Patient safety |
| protocol_dev | 0.95 | Regulatory consequence |
| site_note | 0.70 | Informational only |

Outputs below threshold route to the HITL review queue.
A human reviewer must approve or reject before the record
is committed to the EDC.
