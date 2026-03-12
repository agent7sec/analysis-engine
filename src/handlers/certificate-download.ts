/**
 * GET /certificates/{id}/download
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ok, internalError, unauthorized, notFound, badRequest } from '../http.js';
import { getAnalysisById } from '../repositories/analysis.repository.js';
import { getCertificateByAnalysis } from '../repositories/certificate.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

const s3 = new S3Client({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint, forcePathStyle: true } : {}),
});

export const handler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const analysisId = event.pathParameters?.['id'];
        if (!analysisId) return badRequest('Analysis ID missing');

        const analysis = await getAnalysisById(userId, analysisId);
        if (!analysis) return notFound('Analysis not found');
        if (analysis.status !== 'COMPLETED') return badRequest('Certificate not yet available');

        const certificate = await getCertificateByAnalysis(analysisId);
        if (!certificate) return notFound('Certificate not found');

        const downloadUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({
                Bucket: config.s3.outputBucket,
                Key: certificate.s3Key,
                ResponseContentDisposition: `attachment; filename="certificate-${analysisId}.pdf"`,
            }),
            { expiresIn: config.presignedUrl.downloadTtl },
        );

        const expiresAt = new Date(Date.now() + config.presignedUrl.downloadTtl * 1000).toISOString();

        logger.info('certificate.download-url-generated', { analysisId, userId });
        return ok({ download_url: downloadUrl, expires_at: expiresAt });
    } catch (err) {
        logger.error('certificate.download.error', { err });
        return internalError();
    }
};
