# Analysis Engine — DynamoDB Table Design

## Table: `analyses`

**Primary Key**: `PK` (String) — `USER#<userId>`  
**Sort Key**: `SK` (String) — `ANALYSIS#<analysisId>`  
**GSI `StatusIndex`**: `status` (PK) + `createdAt` (SK) — used by admin to list PENDING_APPROVAL items

### Attributes

| Attribute | Type | Description |
|---|---|---|
| `PK` | S | `USER#<userId>` |
| `SK` | S | `ANALYSIS#<analysisId>` |
| `analysisId` | S | UUID |
| `tenantId` | S | Auth0 org_id |
| `userId` | S | Auth0 sub |
| `fileName` | S | Original zip filename |
| `s3Key` | S | Key in s3-staging-uploads |
| `status` | S | VERIFYING \| ANALYZING \| PENDING_APPROVAL \| APPROVED \| REJECTED \| COMPLETED \| FAILED |
| `sfnExecutionArn` | S | Step Functions execution ARN |
| `sfnTaskToken` | S | HITL task token (set while PENDING_APPROVAL, cleared after) |
| `resultSummary` | M | `{opengrep: {}, gitleaks: {}, trivy: {}}` |
| `approvalNote` | S | Admin note on approval |
| `rejectionReason` | S | Admin reason on rejection |
| `approvedBy` | S | Admin user sub |
| `createdAt` | S | ISO timestamp |
| `updatedAt` | S | ISO timestamp |

---

## Table: `certificates`

**Primary Key**: `PK` (String) — `ANALYSIS#<analysisId>`  
**Sort Key**: `SK` (String) — `CERT#<certificateId>`

### Attributes

| Attribute | Type | Description |
|---|---|---|
| `PK` | S | `ANALYSIS#<analysisId>` |
| `SK` | S | `CERT#<certificateId>` |
| `certificateId` | S | UUID |
| `analysisId` | S | Reference to analysis |
| `tenantId` | S | Auth0 org_id |
| `s3Key` | S | Key in s3-output-certificates |
| `issuedAt` | S | ISO timestamp |
| `metadata` | M | Additional metadata |
