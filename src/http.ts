import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
};

export function ok<T>(body: T, statusCode = 200, customHeaders: Record<string, string | number | boolean> = {}): APIGatewayProxyResultV2 {
    return { statusCode, headers: { ...headers, ...customHeaders }, body: JSON.stringify(body) };
}

export function created<T>(body: T, customHeaders: Record<string, string | number | boolean> = {}): APIGatewayProxyResultV2 {
    return { statusCode: 201, headers: { ...headers, ...customHeaders }, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
    return { statusCode: 400, headers, body: JSON.stringify({ error: message }) };
}

export function unauthorized(message = 'Unauthorized'): APIGatewayProxyResultV2 {
    return { statusCode: 401, headers, body: JSON.stringify({ error: message }) };
}

export function notFound(message = 'Not found'): APIGatewayProxyResultV2 {
    return { statusCode: 404, headers, body: JSON.stringify({ error: message }) };
}

export function internalError(message = 'Internal server error'): APIGatewayProxyResultV2 {
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
}
