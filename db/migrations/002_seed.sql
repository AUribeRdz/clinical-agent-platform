-- Migration 002: seed demo data for the interview demo
-- Creates sample agent runs with varying confidence scores to demonstrate
-- the HITL gate triggering correctly.

INSERT INTO source_records (system, subject_id, raw_json) VALUES
  ('mock_edc', 'SUB-001', '{"note":"Patient reported headache onset 2026-05-01. Severity mild.","visit":"V2"}'),
  ('mock_edc', 'SUB-002', '{"note":"Nausea following dose 3. Onset 2026-05-10. Resolved same day.","visit":"V3"}'),
  ('mock_edc', 'SUB-003', '{"note":"Site monitoring visit completed. No protocol deviations noted.","visit":"V1"}'),
  ('mock_edc', 'SUB-004', '{"note":"Subject possibly missed dose — unclear from notes.","visit":"V4"}');

-- High confidence run — goes straight to approved (no HITL needed)
INSERT INTO agent_runs (record_id, prompt_version_hash, input_hash, output_json, confidence, status, field_type, triggered_by)
SELECT
  id,
  'abc1234def5678',
  md5(raw_json::text),
  '{"ae_term":"headache","severity":"mild","onset_date":"2026-05-01","confidence":0.96,"status":"approved"}',
  0.96,
  'approved',
  'adverse_event',
  'cra_agent'
FROM source_records WHERE subject_id = 'SUB-001';

-- Medium confidence run — above site_note threshold, approved
INSERT INTO agent_runs (record_id, prompt_version_hash, input_hash, output_json, confidence, status, field_type, triggered_by)
SELECT
  id,
  'abc1234def5678',
  md5(raw_json::text),
  '{"ae_term":"nausea","severity":"mild","onset_date":"2026-05-10","confidence":0.88,"status":"approved"}',
  0.88,
  'approved',
  'adverse_event',
  'cra_agent'
FROM source_records WHERE subject_id = 'SUB-002';

-- Low confidence run — below adverse_event threshold (0.92), triggers HITL
INSERT INTO agent_runs (record_id, prompt_version_hash, input_hash, output_json, confidence, status, field_type, triggered_by)
SELECT
  id,
  'abc1234def5678',
  md5(raw_json::text),
  '{"ae_term":null,"severity":null,"onset_date":null,"confidence":0.71,"status":"requires_review","reason":"Ambiguous note — could not extract AE with sufficient confidence"}',
  0.71,
  'requires_review',
  'adverse_event',
  'cra_agent'
FROM source_records WHERE subject_id = 'SUB-004';

-- Seed audit log entries
INSERT INTO audit_log (table_name, row_id, action, actor)
SELECT 'agent_runs', id, 'INSERT', 'cra_agent' FROM agent_runs;
