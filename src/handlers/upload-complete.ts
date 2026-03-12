/**
 * POST /uploads/complete
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { badRequest, ok, internalError, unauthorized, notFound } from '../http.js';
import { getAnalysisById, updateAnalysisStatus } from '../repositories/analysis.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

const sqs = new SQSClient({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint } : {}),
});

interface RequestBody { analysis_id: string; file_key: string; }

export const handler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId, tenantId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const body = parseBody(event.body);
        if (!body?.analysis_id || !body.file_key) {
            return badRequest('analysis_id and file_key are required');
        }

        const analysis = await getAnalysisById(userId, body.analysis_id);
        if (!analysis) return notFound('Analysis not found');

        await updateAnalysisStatus(userId, body.analysis_id, 'VERIFYING');

        const message = {
            analysisId: body.analysis_id,
            tenantId,
            userId,
            s3Bucket: config.s3.stagingBucket,
            s3Key: body.file_key,
            fileName: analysis.fileName,
            enqueuedAt: new Date().toISOString(),
        };

        await sqs.send(new SendMessageCommand({
            QueueUrl: config.sqs.analysisQueueUrl,
            MessageBody: JSON.stringify(message),
            MessageAttributes: {
                analysisId: { DataType: 'String', StringValue: body.analysis_id },
                tenantId: { DataType: 'String', StringValue: tenantId },
            },
        }));

        logger.info('upload-complete.queued', { analysisId: body.analysis_id, userId });
        return ok({ analysis_id: body.analysis_id, status: 'VERIFYING' });
    } catch (err) {
        logger.error('upload-complete.error', { err });
        return internalError();
    }
};

function parseBody(raw: string | null | undefined): RequestBody | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as RequestBody; } catch { return null; }
}
