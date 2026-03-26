/**
 * POST /analyses
 *
 * Called by the customer portal after a successful S3 upload.
 * Creates the DynamoDB analysis record with status UPLOADED.
 *
 * Request body (camelCase from frontend):
 *   { fileName, fileSize, fileHash, fileKey, tenantId }
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { logger } from '../logger.js';
import { badRequest, ok, internalError, unauthorized } from '../http.js';
import { createAnalysis } from '../repositories/analysis.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

interface RequestBody {
    fileName: string;
    fileSize: number;
    fileHash: string;
    fileKey: string;
    tenantId?: string;
}

export const handler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId, tenantId: authTenantId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const body = parseBody(event.body);
        if (!body) return badRequest('Request body must be JSON');
        if (!body.fileName) return badRequest('fileName is required');
        if (!body.fileHash) return badRequest('fileHash is required');
        if (!body.fileKey) return badRequest('fileKey is required');
        if (body.fileSize == null) return badRequest('fileSize is required');

        const tenantId = authTenantId || body.tenantId || 'default';

        const analysis = await createAnalysis({
            tenantId,
            userId,
            s3Key: body.fileKey,
            fileName: body.fileName,
            fileSize: body.fileSize,
            fileHash: body.fileHash,
        });

        logger.info('create-analysis.created', {
            analysisId: analysis.analysisId,
            userId,
            tenantId,
            fileHash: body.fileHash,
        });

        return ok({
            analysisId: analysis.analysisId,
            fileHash: analysis.fileHash,
            fileName: analysis.fileName,
            fileSize: analysis.fileSize,
            status: analysis.status,
            createdAt: analysis.createdAt,
        });
    } catch (err) {
        logger.error('create-analysis.error', { err });
        return internalError();
    }
};

function parseBody(raw: string | null | undefined): RequestBody | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as RequestBody; } catch { return null; }
}
