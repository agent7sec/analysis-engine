/**
 * Lambda Authorizer for API Gateway HTTP API (JWT-based).
 * Validates Auth0 JWTs using JWKS — no round-trip to Auth0 per request.
 *
 * Returns IAM policy + context with userId and tenantId extracted from the token.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type {
    APIGatewayRequestAuthorizerEventV2,
    APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Cache the JWKS client across Lambda invocations (reused on warm starts)
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
    if (!jwks) {
        jwks = createRemoteJWKSet(
            new URL(`https://${config.auth.domain}/.well-known/jwks.json`),
        );
    }
    return jwks;
}

interface AuthContext {
    userId: string;
    tenantId: string;
    email: string;
}

export const handler = async (
    event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> => {
    const deny = (reason: string): APIGatewaySimpleAuthorizerWithContextResult<AuthContext> => {
        logger.warn('authorizer.deny', { reason });
        return {
            isAuthorized: false,
            context: { userId: '', tenantId: '', email: '' },
        };
    };

    try {
        const authHeader = event.headers?.['authorization'] ?? event.headers?.['Authorization'];
        if (!authHeader?.startsWith('Bearer ')) {
            return deny('missing bearer token');
        }

        const token = authHeader.slice(7);
        const { payload } = await jwtVerify(token, getJwks(), {
            issuer: `https://${config.auth.domain}/`,
            audience: config.auth.audience,
        });

        const userId = (payload['sub'] as string | undefined) ?? '';
        const tenantId =
            (payload['https://api.your-platform.com/tenant_id'] as string | undefined) ??
            (payload['org_id'] as string | undefined) ??
            '';
        const email = (payload['email'] as string | undefined) ?? '';

        if (!userId) return deny('missing sub claim');

        logger.info('authorizer.allow', { userId, tenantId });
        return {
            isAuthorized: true,
            context: { userId, tenantId, email },
        };
    } catch (err) {
        return deny(`jwt error: ${(err as Error).message}`);
    }
};
