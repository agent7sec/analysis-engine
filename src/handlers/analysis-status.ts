/**
 * GET /analysis-status/{id}
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { logger } from '../logger.js';
import { ok, internalError, unauthorized, notFound } from '../http.js';
import { getAnalysisById } from '../repositories/analysis.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

// Never expose these to the client
const HIDDEN = new Set(['sfnTaskToken', 'sfnExecutionArn', 'PK', 'SK']);

export const handler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const id = event.pathParameters?.['id'];
        if (!id) return notFound('Analysis ID missing');

        const analysis = await getAnalysisById(userId, id);
        if (!analysis) return notFound('Analysis not found');

        // Strip internal fields
        const response = Object.fromEntries(
            Object.entries(analysis).filter(([k]) => !HIDDEN.has(k)),
        );

        if (analysis.status === 'COMPLETED') {
            response['download_url'] = `/certificates/${analysis.analysisId}/download`;
        }

        logger.info('analysis-status.fetched', { analysisId: id, status: analysis.status, userId });
        return ok(response);
    } catch (err) {
        logger.error('analysis-status.error', { err });
        return internalError();
    }
};
