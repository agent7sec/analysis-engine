import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../src/config.js', () => ({
    config: {
        env: 'test',
        logLevel: 'silent',
        aws: { region: 'us-east-1', endpoint: 'http://localhost:4566' },
        s3: {
            stagingBucket: 'test-staging',
            processingBucket: 'test-processing',
            quarantineBucket: 'test-quarantine',
            outputBucket: 'test-output',
        },
        sqs: { analysisQueueUrl: 'http://localhost:4566/000000000000/test-queue' },
        sfn: { stateMachineArn: 'arn:aws:states:us-east-1:000000000000:stateMachine:test' },
        dynamo: { analysesTable: 'analyses', certificatesTable: 'certificates' },
        auth: { domain: 'test.auth0.com', audience: 'https://api.test.com' },
        presignedUrl: { uploadTtl: 900, downloadTtl: 60 },
    },
}));

vi.mock('../../src/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/repositories/analysis.repository.js', () => ({
    createAnalysis: vi.fn(),
    getAnalysisById: vi.fn(),
    getAnalysisByIdAdmin: vi.fn(),
    updateAnalysisStatus: vi.fn(),
    listAnalysesByUser: vi.fn(),
    listPendingApproval: vi.fn(),
}));

vi.mock('../../src/repositories/certificate.repository.js', () => ({
    createCertificate: vi.fn(),
    getCertificateByAnalysis: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: vi.fn(() => ({ send: vi.fn() })),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: vi.fn(() => ({ send: vi.fn() })),
    SendMessageCommand: vi.fn(),
}));

// ─── Mocked repository bindings ──────────────────────────────────────────────

import {
    createAnalysis,
    getAnalysisById,
} from '../../src/repositories/analysis.repository.js';
import { getCertificateByAnalysis } from '../../src/repositories/certificate.repository.js';

const mockCreateAnalysis = vi.mocked(createAnalysis);
const mockGetAnalysisById = vi.mocked(getAnalysisById);
const mockGetCertByAnalysis = vi.mocked(getCertificateByAnalysis);

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const makeAnalysis = (overrides: Partial<Record<string, unknown>> = {}) => ({
    PK: 'USER#user-1',
    SK: 'ANALYSIS#analysis-123',
    analysisId: 'analysis-123',
    userId: 'user-1',
    tenantId: 'org-1',
    fileName: 'code.zip',
    s3Key: '',
    status: 'VERIFYING',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
});

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
    body: null,
    headers: {},
    pathParameters: {},
    requestContext: {
        authorizer: { userId: 'user-1', tenantId: 'org-1', email: 'u@example.com' },
    },
    ...overrides,
}) as any;

// ─── upload-presigned-url ────────────────────────────────────────────────────

describe('upload-presigned-url handler', () => {
    let handler: (e: any) => Promise<APIGatewayProxyResultV2>;

    beforeAll(async () => {
        const mod = await import('../../src/handlers/upload-presigned-url.js');
        handler = mod.handler;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateAnalysis.mockResolvedValue(makeAnalysis() as any);
    });

    it('returns 200 with upload_url and analysis_id', async () => {
        const res = await handler(makeEvent({
            body: JSON.stringify({ file_name: 'code.zip', content_type: 'application/zip' }),
        }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body as string);
        expect(body.upload_url).toContain('s3.example.com');
        expect(body.analysis_id).toBe('analysis-123');
        expect(body.file_key).toContain('code.zip');
    });

    it('returns 400 when file_name is missing', async () => {
        const res = await handler(makeEvent({ body: JSON.stringify({ content_type: 'application/zip' }) }));
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 when file is not a zip', async () => {
        const res = await handler(makeEvent({ body: JSON.stringify({ file_name: 'malware.exe' }) }));
        expect(res.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const res = await handler(makeEvent({
            body: JSON.stringify({ file_name: 'code.zip' }),
            requestContext: { authorizer: { userId: '', tenantId: 'org-1', email: '' } },
        }));
        expect(res.statusCode).toBe(401);
    });
});

// ─── analysis-status ─────────────────────────────────────────────────────────

describe('analysis-status handler', () => {
    let handler: (e: any) => Promise<APIGatewayProxyResultV2>;

    beforeAll(async () => {
        const mod = await import('../../src/handlers/analysis-status.js');
        handler = mod.handler;
    });

    beforeEach(() => vi.clearAllMocks());

    it('returns 200 and does NOT expose sfnTaskToken or DynamoDB keys', async () => {
        mockGetAnalysisById.mockResolvedValue(makeAnalysis({
            sfnTaskToken: 'SECRET_TOKEN',
            sfnExecutionArn: 'arn:aws:states:...',
            status: 'ANALYZING',
        }) as any);

        const res = await handler(makeEvent({ pathParameters: { id: 'analysis-123' } }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body as string);

        expect(body.sfnTaskToken).toBeUndefined();
        expect(body.sfnExecutionArn).toBeUndefined();
        expect(body.PK).toBeUndefined();
        expect(body.SK).toBeUndefined();
        expect(body.status).toBe('ANALYZING');
    });

    it('returns 404 when analysis not found', async () => {
        mockGetAnalysisById.mockResolvedValue(null);
        const res = await handler(makeEvent({ pathParameters: { id: 'does-not-exist' } }));
        expect(res.statusCode).toBe(404);
    });

    it('returns 401 when userId is missing', async () => {
        const res = await handler(makeEvent({
            pathParameters: { id: 'analysis-123' },
            requestContext: { authorizer: { userId: '', tenantId: 'org-1', email: '' } },
        }));
        expect(res.statusCode).toBe(401);
    });

    it('includes download_url when status is COMPLETED', async () => {
        mockGetAnalysisById.mockResolvedValue(makeAnalysis({ status: 'COMPLETED' }) as any);
        const res = await handler(makeEvent({ pathParameters: { id: 'analysis-123' } }));
        const body = JSON.parse(res.body as string);
        expect(body.download_url).toContain('/certificates/analysis-123/download');
    });
});

// ─── health ──────────────────────────────────────────────────────────────────

describe('health handler', () => {
    it('returns 200 with status ok', async () => {
        const { handler } = await import('../../src/handlers/health.js');
        const res = await handler();
        expect(res.statusCode).toBe(200);
        const body = JSON.parse((res as any).body);
        expect(body.status).toBe('ok');
        expect(body.service).toBe('analysis-engine');
    });
});

// ─── certificate-download ────────────────────────────────────────────────────

describe('certificate-download handler', () => {
    let handler: (e: any) => Promise<APIGatewayProxyResultV2>;

    beforeAll(async () => {
        const mod = await import('../../src/handlers/certificate-download.js');
        handler = mod.handler;
    });

    beforeEach(() => vi.clearAllMocks());

    it('returns 400 when analysis is not COMPLETED', async () => {
        mockGetAnalysisById.mockResolvedValue(makeAnalysis({ status: 'ANALYZING' }) as any);
        const res = await handler(makeEvent({ pathParameters: { id: 'analysis-123' } }));
        expect(res.statusCode).toBe(400);
    });

    it('returns 200 with presigned download_url when completed', async () => {
        mockGetAnalysisById.mockResolvedValue(makeAnalysis({ status: 'COMPLETED' }) as any);
        mockGetCertByAnalysis.mockResolvedValue({
            PK: 'ANALYSIS#analysis-123',
            SK: 'CERT#cert-1',
            certificateId: 'cert-1',
            analysisId: 'analysis-123',
            tenantId: 'org-1',
            s3Key: 'org-1/analysis-123/certificate.pdf',
            issuedAt: '2025-01-01T00:00:00Z',
        } as any);
        const res = await handler(makeEvent({ pathParameters: { id: 'analysis-123' } }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body as string);
        expect(body.download_url).toContain('s3.example.com');
        expect(body.expires_at).toBeDefined();
    });
});
