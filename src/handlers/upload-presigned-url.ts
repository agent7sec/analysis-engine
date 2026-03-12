/**
 * POST /uploads/presigned-url
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { badRequest, ok, internalError, unauthorized } from '../http.js';
import { createAnalysis } from '../repositories/analysis.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

const s3 = new S3Client({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint, forcePathStyle: true } : {}),
});

interface RequestBody { file_name: string; content_type: string; }

export const handler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId, tenantId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const body = parseBody(event.body);
        if (!body) return badRequest('Request body must be JSON with file_name and content_type');
        if (!body.file_name) return badRequest('file_name is required');
        if (!body.file_name.endsWith('.zip')) return badRequest('Only .zip files are accepted');

        const analysis = await createAnalysis({ tenantId, userId, s3Key: '', fileName: body.file_name });

        const fileKey = `${tenantId}/${analysis.analysisId}/${body.file_name}`;
        const uploadUrl = await getSignedUrl(
            s3,
            new PutObjectCommand({
                Bucket: config.s3.stagingBucket,
                Key: fileKey,
                ContentType: body.content_type || 'application/zip',
                Tagging: `analysis_id=${analysis.analysisId}`,
            }),
            { expiresIn: config.presignedUrl.uploadTtl },
        );

        const expiresAt = new Date(Date.now() + config.presignedUrl.uploadTtl * 1000).toISOString();

        logger.info('presigned-url.created', { analysisId: analysis.analysisId, fileKey, userId, tenantId });

        return ok({ upload_url: uploadUrl, file_key: fileKey, analysis_id: analysis.analysisId, expires_at: expiresAt });
    } catch (err) {
        logger.error('presigned-url.error', { err });
        return internalError();
    }
};

function parseBody(raw: string | null | undefined): RequestBody | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as RequestBody; } catch { return null; }
}
