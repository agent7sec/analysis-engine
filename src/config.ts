/**
 * Central configuration loaded from environment variables.
 * Throws at import time if required variables are missing.
 */

function required(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
}

function optional(key: string, fallback: string): string {
    return process.env[key] ?? fallback;
}

export const config = {
    env: optional('NODE_ENV', 'development'),
    logLevel: optional('LOG_LEVEL', 'info'),

    aws: {
        region: optional('AWS_REGION', 'us-east-1'),
        endpoint: process.env['AWS_ENDPOINT'], // undefined in prod, set for LocalStack
    },

    s3: {
        stagingBucket: required('S3_STAGING_BUCKET'),
        processingBucket: required('S3_PROCESSING_BUCKET'),
        quarantineBucket: required('S3_QUARANTINE_BUCKET'),
        outputBucket: required('S3_OUTPUT_BUCKET'),
    },

    sqs: {
        analysisQueueUrl: required('SQS_ANALYSIS_QUEUE_URL'),
    },

    sfn: {
        stateMachineArn: required('SFN_STATE_MACHINE_ARN'),
    },

    dynamo: {
        analysesTable: optional('DYNAMO_ANALYSES_TABLE', 'analyses'),
        certificatesTable: optional('DYNAMO_CERTIFICATES_TABLE', 'certificates'),
    },

    auth: {
        domain: required('AUTH0_DOMAIN'),
        audience: required('AUTH0_AUDIENCE'),
    },

    presignedUrl: {
        uploadTtl: parseInt(optional('PRESIGNED_URL_TTL_UPLOAD', '900')),
        downloadTtl: parseInt(optional('PRESIGNED_URL_TTL_DOWNLOAD', '60')),
    },
} as const;
