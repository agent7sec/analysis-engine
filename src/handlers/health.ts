/** GET /health — no auth required */
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ok } from '../http.js';

export const handler = async (): Promise<APIGatewayProxyResultV2> =>
    ok({ status: 'ok', service: 'analysis-engine', timestamp: new Date().toISOString() });
