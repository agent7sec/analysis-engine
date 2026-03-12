import { v4 as uuidv4 } from 'uuid';
import {
    ddb,
    GetCommand,
    PutCommand,
    QueryCommand,
} from '../db/client.js';
import { config } from '../config.js';

const TABLE = () => config.dynamo.certificatesTable;

export interface Certificate {
    certificateId: string;
    analysisId: string;
    tenantId: string;
    s3Key: string;
    issuedAt: string;
    metadata?: Record<string, unknown>;
    // DynamoDB keys
    PK: string; // ANALYSIS#<analysisId>
    SK: string; // CERT#<certificateId>
}

export interface CreateCertificateInput {
    analysisId: string;
    tenantId: string;
    s3Key: string;
    metadata?: Record<string, unknown>;
}

export async function createCertificate(input: CreateCertificateInput): Promise<Certificate> {
    const certificateId = uuidv4();
    const item: Certificate = {
        PK: `ANALYSIS#${input.analysisId}`,
        SK: `CERT#${certificateId}`,
        certificateId,
        analysisId: input.analysisId,
        tenantId: input.tenantId,
        s3Key: input.s3Key,
        issuedAt: new Date().toISOString(),
        metadata: input.metadata,
    };

    await ddb.send(new PutCommand({ TableName: TABLE(), Item: item }));
    return item;
}

export async function getCertificateByAnalysis(analysisId: string): Promise<Certificate | null> {
    const res = await ddb.send(
        new QueryCommand({
            TableName: TABLE(),
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: {
                ':pk': `ANALYSIS#${analysisId}`,
                ':prefix': 'CERT#',
            },
            ScanIndexForward: false, // newest certificate first
            Limit: 1,
        }),
    );
    return (res.Items?.[0] as Certificate) ?? null;
}

export async function getCertificateById(
    analysisId: string,
    certificateId: string,
): Promise<Certificate | null> {
    const res = await ddb.send(
        new GetCommand({
            TableName: TABLE(),
            Key: {
                PK: `ANALYSIS#${analysisId}`,
                SK: `CERT#${certificateId}`,
            },
        }),
    );
    return (res.Item as Certificate) ?? null;
}
