import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getAnalysisByIdAdmin } from '../repositories/analysis.repository.js';
import { logger } from '../logger.js';
import { ok, badRequest, notFound, internalError } from '../http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const analysisId = event.pathParameters?.id;
    if (!analysisId) {
        return badRequest('Missing analysis ID');
    }

    logger.info(`GET /analyses/${analysisId} called by Admin`);

    try {
        const analysis = await getAnalysisByIdAdmin(analysisId);
        if (!analysis) {
            return notFound('Analysis not found');
        }

        const responseData = {
            id: analysis.analysisId,
            customerName: `Customer ${analysis.tenantId.substring(0, 6)}`,
            submissionDate: analysis.createdAt,
            programmingLanguage: 'polyglot',
            summary: analysis.status,
            ...analysis
        };

        return ok(responseData);
    } catch (error) {
        logger.error('Error fetching analysis', { error, analysisId });
        return internalError('Internal server error');
    }
};
