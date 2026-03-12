-- Analysis Engine — Aurora Serverless v2 Schema
-- Compatible with PostgreSQL 15+

-- =====================================
-- Analyses
-- =====================================
CREATE TABLE IF NOT EXISTS analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,        -- Auth0 sub
    s3_key          TEXT        NOT NULL,        -- key in s3-processing-uploads
    file_name       TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'VERIFYING',
    -- VERIFYING | ANALYZING | PENDING_APPROVAL | APPROVED | REJECTED | COMPLETED | FAILED
    sfn_execution_arn TEXT,                      -- Step Functions execution ARN
    sfn_task_token  TEXT,                        -- HITL task token (set while PENDING_APPROVAL)
    result_summary  JSONB,                       -- {opengrep: {}, gitleaks: {}, trivy: {}}
    approval_note   TEXT,
    rejection_reason TEXT,
    approved_by     TEXT,                        -- admin user sub
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analyses_tenant ON analyses(tenant_id);
CREATE INDEX idx_analyses_user   ON analyses(user_id);
CREATE INDEX idx_analyses_status ON analyses(status);

-- =====================================
-- Certificates
-- =====================================
CREATE TABLE IF NOT EXISTS certificates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id     UUID        NOT NULL REFERENCES analyses(id),
    tenant_id       TEXT        NOT NULL,
    s3_key          TEXT        NOT NULL,        -- key in s3-output-certificates
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    metadata        JSONB
);

CREATE INDEX idx_certs_analysis ON certificates(analysis_id);
CREATE INDEX idx_certs_tenant   ON certificates(tenant_id);

-- =====================================
-- Users Quota
-- =====================================
CREATE TABLE IF NOT EXISTS users_quota (
    user_id         TEXT        PRIMARY KEY,    -- Auth0 sub
    tenant_id       TEXT        NOT NULL,
    analyses_used   INT         NOT NULL DEFAULT 0,
    analyses_limit  INT         NOT NULL DEFAULT 10,
    period_start    TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analyses_updated_at
  BEFORE UPDATE ON analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_quota_updated_at
  BEFORE UPDATE ON users_quota
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
