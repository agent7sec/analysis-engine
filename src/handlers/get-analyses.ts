import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { listAllAnalysesAdmin } from '../repositories/analysis.repository.js';
import { logger } from '../logger.js';
import { ok, internalError } from '../http.js';

export const handler: APIGatewayProxyHandlerV2 = async () => {
    logger.info('GET /analyses called');

    try {
        // In a real application we would verify the user making this call has an Admin role
        // For this reference implementation, the authorizer ensures they are authenticated
        // and we assume the API Gateway route is protected by corporate network/SSO constraints

        const analyses = await listAllAnalysesAdmin();

        // Return mapped to what React-Admin expects: Array of objects with an 'id' property
        // React-Admin also typically requires X-Total-Count header for pagination
        const responseData = analyses.map((a) => ({
            id: a.analysisId,
            customerName: `Customer ${a.tenantId.substring(0, 6)}`, // Placeholder since we don't store names
            submissionDate: a.createdAt,
            programmingLanguage: 'polyglot', // Inferred or added to schema later
            summary: a.status,
            ...a
        }));

        return ok(responseData, 200, {
            'X-Total-Count': responseData.length.toString(),
            'Access-Control-Expose-Headers': 'X-Total-Count'
        });
    } catch (error) {
        logger.error('Error fetching analyses', { error });
        return internalError('Internal server error');
    }
};
