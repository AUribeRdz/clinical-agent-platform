# GxP Clinical Prompt Library

## What this is

A version-controlled library of agent system prompts for clinical adverse
event extraction, built to GxP quality standards.

Prompts in clinical AI deployments are treated as software artifacts — not
configuration. They require change control, acceptance testing, and audit
traceability before any deployment to a regulated environment.

## Why version control matters here

Every agent run in a clinical pipeline stores the git commit hash of the
active prompt file alongside the output, confidence score, and reviewer
decision. This means an auditor can reconstruct exactly what instructions
the agent was operating under at any point in time — a requirement under
21 CFR Part 11 and GCP guidelines.

## Current production version

v1.2.4 — validated on claude-sonnet-4-5-20250929

## How to reproduce these results

1. Open console.anthropic.com and go to Workbench
2. Select model: claude-sonnet-4-5-20250929
3. Paste contents of v1.2.4/ae_extractor.txt into the System Prompt panel
4. Run any of the three test cases in v1.2.4/test_cases/
5. Verify output matches the screenshots in each case file

## Confidence threshold reference

| Field type | Threshold | Rationale |
|---|---|---|
| adverse_event | 0.92 | Patient safety — high bar |
| protocol_dev | 0.95 | Regulatory consequence |
| site_note | 0.70 | Informational only |

Outputs below threshold are routed to a Human-in-the-Loop review queue
rather than written directly to the EDC. A human reviewer must approve
or reject with documented notes before the record is committed.

## Stack this connects to

The prompt files in this folder are loaded at runtime by
`api/src/agent.ts` in the main repository. The active prompt version
hash is stored in the `prompt_version_hash` column of the `agent_runs`
table on every execution.

## Version history

| Version | Date | Status |
|---|---|---|
| v1.2.4 | 2026-05-23 | Current production version |
| v1.2.3 | 2026-05-22 | Superseded — model behavior issue |

See [CHANGELOG.md](CHANGELOG.md) for full details on each change.