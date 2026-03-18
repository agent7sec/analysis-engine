import express from 'express';
import cors from 'cors';

// Set up LocalStack environment variables BEFORE importing handlers
process.env.AWS_ENDPOINT = 'http://localhost:4566';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMO_ANALYSES_TABLE = 'analyses';
process.env.DYNAMO_CERTIFICATES_TABLE = 'certificates';
process.env.S3_STAGING_BUCKET = 'dummy';
process.env.S3_PROCESSING_BUCKET = 'dummy';
process.env.S3_QUARANTINE_BUCKET = 'dummy';
process.env.S3_OUTPUT_BUCKET = 'dummy';
process.env.SQS_ANALYSIS_QUEUE_URL = 'dummy';
process.env.SFN_STATE_MACHINE_ARN = 'dummy';
process.env.AUTH0_DOMAIN = 'dummy';
process.env.AUTH0_AUDIENCE = 'dummy';

delete process.env.AWS_SESSION_TOKEN;
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

import { handler as getAnalyses } from './handlers/get-analyses.js';
import { handler as getAnalysis } from './handlers/get-analysis.js';
import { approveHandler, rejectHandler } from './handlers/hitl-approval.js';
import { handler as presignedUrlHandler } from './handlers/upload-presigned-url.js';
import { handler as uploadCompleteHandler } from './handlers/upload-complete.js';

const app = express();
app.use(cors({ exposedHeaders: ['X-Total-Count'] }));
app.use(express.json());

const fakeEvent = (req: express.Request) => {
    return {
        pathParameters: req.params,
        queryStringParameters: req.query as any,
        body: Object.keys(req.body || {}).length > 0 ? JSON.stringify(req.body) : null,
        requestContext: {
            authorizer: {
                userId: 'admin-user',
                tenantId: 'tenant-123',
                email: 'admin@local'
            }
        }
    } as any;
};

const wrap = (handler: any) => async (req: express.Request, res: express.Response) => {
    try {
        const result = await handler(fakeEvent(req));
        if (result.headers) {
            for (const [k, v] of Object.entries(result.headers)) {
                res.setHeader(k, v as string);
            }
        }
        res.status(result.statusCode || 200).send(result.body);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Local server error' });
    }
};

app.get('/analyses', wrap(getAnalyses));
app.get('/analyses/:id', wrap(getAnalysis));
app.post('/analyses/:id/approve', wrap(approveHandler));
app.post('/analyses/:id/reject', wrap(rejectHandler));
app.post('/uploads/presigned-url', wrap(presignedUrlHandler));
app.post('/uploads/complete', wrap(uploadCompleteHandler));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3000, () => {
    console.log('Local dev server running on http://localhost:3000');
});
