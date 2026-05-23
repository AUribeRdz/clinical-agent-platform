-- Migration 001: initial schema
-- All tables use append-only inserts for GxP / 21 CFR Part 11 compliance.
-- No UPDATE or DELETE is ever issued on source_records, agent_runs, or audit_log.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Raw data ingested from clinical source systems (EDC, CTMS, eTMF)
CREATE TABLE source_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system      VARCHAR(50)  NOT NULL,          -- e.g. 'medidata_rave', 'mock_edc'
  subject_id  VARCHAR(100) NOT NULL,
  raw_json    JSONB        NOT NULL,
  ingested_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_records_subject ON source_records (subject_id);
CREATE INDEX idx_source_records_system  ON source_records (system);
CREATE INDEX idx_source_records_json    ON source_records USING GIN (raw_json);

-- One row per agent execution — never updated, only inserted
CREATE TABLE agent_runs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id            UUID         REFERENCES source_records(id),
  prompt_version_hash  VARCHAR(64)  NOT NULL,   -- git commit hash of the prompt file
  input_hash           VARCHAR(64)  NOT NULL,   -- SHA-256 of the input payload
  output_json          JSONB        NOT NULL,
  confidence           NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status               VARCHAR(30)  NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','requires_review','approved','rejected')),
  field_type           VARCHAR(50),              -- e.g. 'adverse_event', 'protocol_dev'
  run_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  triggered_by         VARCHAR(100) NOT NULL    -- agent name or user ID
);

CREATE INDEX idx_agent_runs_status     ON agent_runs (status);
CREATE INDEX idx_agent_runs_confidence ON agent_runs (confidence);
CREATE INDEX idx_agent_runs_record     ON agent_runs (record_id);

-- HITL decisions — one row per human review action
CREATE TABLE hitl_decisions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id      UUID        NOT NULL REFERENCES agent_runs(id),
  reviewer_id VARCHAR(100) NOT NULL,
  decision    VARCHAR(20)  NOT NULL CHECK (decision IN ('approved','rejected')),
  notes       TEXT,                             -- reviewer must provide notes on rejection
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hitl_decisions_run ON hitl_decisions (run_id);

-- Append-only audit log — satisfies 21 CFR Part 11
-- No application code ever issues UPDATE or DELETE on this table.
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(50)  NOT NULL,
  row_id     UUID         NOT NULL,
  action     VARCHAR(20)  NOT NULL CHECK (action IN ('INSERT','SELECT')),
  actor      VARCHAR(100) NOT NULL,
  ts         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table  ON audit_log (table_name);
CREATE INDEX idx_audit_log_row    ON audit_log (row_id);
CREATE INDEX idx_audit_log_ts     ON audit_log (ts);

-- Enforce append-only on audit_log at the database level
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;
