# Analysis Engine

Central serverless backend for the Gen AI Security Certification Platform.
Orchestrates the full pipeline from file ingestion to certificate delivery.

## Architecture

```
Customer Upload
    │
    ▼
POST /uploads/presigned-url ──► S3 staging bucket ──► GuardDuty + s3-zip-security-scanner
    │                                                              │
    ▼                                                              ▼
POST /uploads/complete ──► SQS ──► SQS Consumer ──► Step Functions
                                                           │
                    ┌──────────────────────────────────────┤
                    ▼                                       ▼
          CheckSemanticCache                           RunAnalysis
          (ElastiCache Redis)                    (Batch / Fargate Spot)
                    │                                       │
                    └──────────────┬────────────────────────┘
                                   ▼
                          WaitForHumanApproval (HITL)
                                   │
                          Admin Portal calls:
                          POST /analyses/{id}/approve
                                   │
                                   ▼
                          GenerateCertificate (PDF → S3)
                                   │
                                   ▼
                    GET /certificates/{id}/download ──► Customer
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/uploads/presigned-url` | Auth0 JWT | Generate S3 presigned PUT URL |
| `POST` | `/uploads/complete` | Auth0 JWT | Notify after upload, start pipeline |
| `GET` | `/analysis-status/{id}` | Auth0 JWT | Poll analysis status |
| `GET` | `/certificates/{id}/download` | Auth0 JWT | Get presigned PDF download URL |
| `POST` | `/analyses/{id}/approve` | Auth0 JWT (admin) | Approve → SendTaskSuccess |
| `POST` | `/analyses/{id}/reject` | Auth0 JWT (admin) | Reject → SendTaskFailure |

## Tech Stack

- **Runtime**: Node.js 22, TypeScript, ARM64 Lambda
- **Infrastructure-as-Code**: AWS SAM
- **Database**: Aurora Serverless v2 via RDS Data API
- **Orchestration**: AWS Step Functions
- **Queue**: Amazon SQS (+ EventBridge for S3 events)
- **Analysis**: AWS Batch on Fargate Spot (runs `sast-analyzer` container)
- **Auth**: Auth0 JWT authorizer (JWKS, no per-request round-trip)
- **PDF**: pdfkit
- **Tests**: Vitest

## Project Structure

```
src/
├── config.ts                    # Env var config (fails fast if missing)
├── http.ts                      # HTTP response helpers
├── logger.ts                    # Structured JSON logger (Winston)
├── db/
│   └── client.ts                # Aurora RDS Data API client
├── repositories/
│   ├── analysis.repository.ts   # CRUD for analyses table
│   └── certificate.repository.ts
└── handlers/
    ├── authorizer.ts            # Lambda JWT authorizer
    ├── health.ts
    ├── upload-presigned-url.ts
    ├── upload-complete.ts
    ├── analysis-status.ts
    ├── certificate-download.ts
    ├── sqs-consumer.ts          # Dequeue → StartExecution
    ├── store-task-token.ts      # Save HITL task token to Aurora
    ├── hitl-approval.ts         # Approve / Reject (SendTaskSuccess/Failure)
    ├── certificate-generator.ts # PDF generation + S3 upload
    └── check-semantic-cache.ts  # ElastiCache cache check (stub)
db/
└── schema.sql                   # Aurora schema (analyses, certificates, users_quota)
state-machine/
└── analysis-pipeline.asl.json  # Step Functions state machine definition
scripts/
├── build-lambdas.sh             # esbuild bundler for all handlers
└── bootstrap-localstack.sh      # Create local dev AWS resources
tests/
└── unit/
    └── handlers.test.ts
```

## Getting Started

### 1. Configure Environment

```bash
cp .env.example .env
# Fill in Auth0, Aurora, S3, SQS, and Step Functions values
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Bootstrap LocalStack (dev)

```bash
npm run bootstrap
```

### 4. Build Lambdas

```bash
npm run build:lambdas
```

### 5. Deploy with SAM

```bash
# First time (guided)
sam deploy --guided --template-file template.yaml

# Subsequent
sam deploy --template-file template.yaml \
  --stack-name analysis-engine \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --parameter-overrides \
    "Auth0Domain=your-tenant.us.auth0.com" \
    "Auth0Audience=https://api.your-platform.com" \
    "DbClusterArn=..." \
    "DbSecretArn=..."
```

## Testing

```bash
npm test              # Unit tests
npm run test:coverage # With coverage
npm run test:integration  # Requires LocalStack
```

## Notes

- **Semantic cache** (`check-semantic-cache.ts`) is a stub — always returns cache miss until ElastiCache + embedding model are provisioned
- **HITL task token** is stored in Aurora during `WaitForHumanApproval` and cleared after admin approves/rejects
- **Analysis status** endpoint never exposes `sfn_task_token` or internal ARNs

## License

Proprietary
