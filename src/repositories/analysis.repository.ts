/**
 * Repository for the `analyses` DynamoDB table.
 *
 * Access patterns:
 *   - Get by ID             → GetItem  (PK=USER#userId, SK=ANALYSIS#id)
 *   - List by user          → Query    (PK=USER#userId)
 *   - List PENDING_APPROVAL → Query on StatusIndex GSI (status=PENDING_APPROVAL)
 *   - Get by ID (admin)     → Query on StatusIndex (analysisId GSI, or scan small table)
 */

import { v4 as uuidv4 } from 'uuid';
import {
    ddb,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    ScanCommand,
} from '../db/client.js';
import { config } from '../config.js';

const TABLE = () => config.dynamo.analysesTable;

export type AnalysisStatus =
    | 'VERIFYING'
    | 'ANALYZING'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'
    | 'COMPLETED'
    | 'FAILED';

export interface Analysis {
    analysisId: string;
    tenantId: string;
    userId: string;
    s3Key: string;
    fileName: string;
    status: AnalysisStatus;
    sfnExecutionArn?: string;
    sfnTaskToken?: string;
    resultSummary?: unknown;
    approvalNote?: string;
    rejectionReason?: string;
    approvedBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateAnalysisInput {
    tenantId: string;
    userId: string;
    s3Key: string;
    fileName: string;
}

export async function createAnalysis(input: CreateAnalysisInput): Promise<Analysis> {
    const now = new Date().toISOString();
    const analysisId = uuidv4();

    const item: Analysis & { PK: string; SK: string } = {
        PK: `USER#${input.userId}`,
        SK: `ANALYSIS#${analysisId}`,
        analysisId,
        tenantId: input.tenantId,
        userId: input.userId,
        s3Key: input.s3Key,
        fileName: input.fileName,
        status: 'VERIFYING',
        createdAt: now,
        updatedAt: now,
    };

    await ddb.send(new PutCommand({ TableName: TABLE(), Item: item }));
    return item;
}

export async function getAnalysisById(userId: string, analysisId: string): Promise<Analysis | null> {
    const res = await ddb.send(
        new GetCommand({
            TableName: TABLE(),
            Key: { PK: `USER#${userId}`, SK: `ANALYSIS#${analysisId}` },
        }),
    );
    return (res.Item as Analysis) ?? null;
}

/**
 * Admin lookup by analysisId only (no userId known).
 * Uses the StatusIndex GSI — queries all items with this analysisId.
 * For small tables this is acceptable; for large scale, add a dedicated GSI.
 */
export async function getAnalysisByIdAdmin(analysisId: string): Promise<Analysis | null> {
    const res = await ddb.send(
        new QueryCommand({
            TableName: TABLE(),
            IndexName: 'AnalysisIdIndex',
            KeyConditionExpression: 'analysisId = :id',
            ExpressionAttributeValues: { ':id': analysisId },
            Limit: 1,
        }),
    );
    return (res.Items?.[0] as Analysis) ?? null;
}

export async function listAnalysesByUser(userId: string): Promise<Analysis[]> {
    const res = await ddb.send(
        new QueryCommand({
            TableName: TABLE(),
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':prefix': 'ANALYSIS#',
            },
            ScanIndexForward: false, // newest first
        }),
    );
    return (res.Items ?? []) as Analysis[];
}

export async function listPendingApproval(): Promise<Analysis[]> {
    const res = await ddb.send(
        new QueryCommand({
            TableName: TABLE(),
            IndexName: 'StatusIndex',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'PENDING_APPROVAL' },
            ScanIndexForward: true, // oldest first for FIFO review
        }),
    );
    return (res.Items ?? []) as Analysis[];
}

export async function listAllAnalysesAdmin(): Promise<Analysis[]> {
    // Note: In a production app, scanning an entire table is an anti-pattern.
    // However, it's sufficient for this MVP/dashboard context until the dataset grows.
    // Then we would add a GSI where PK is a static string like "TYPE#ANALYSIS"
    // or use ElasticSearch/OpenSearch.
    const res = await ddb.send(
        new ScanCommand({
            TableName: TABLE(),
        }),
    );
    // Filter out rows that are not analyses (e.g. certificates if they were in the same table, though they aren't here)
    const items = (res.Items ?? []) as (Analysis & { SK?: string })[];
    return items.filter((item) => item.SK?.startsWith('ANALYSIS#')).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface UpdateAnalysisInput {
    sfnExecutionArn?: string;
    sfnTaskToken?: string | null;
    resultSummary?: unknown;
    approvalNote?: string;
    rejectionReason?: string;
    approvedBy?: string;
}

export async function updateAnalysisStatus(
    userId: string,
    analysisId: string,
    status: AnalysisStatus,
    extra: UpdateAnalysisInput = {},
): Promise<void> {
    const now = new Date().toISOString();

    const updates: string[] = ['#status = :status', 'updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#status': 'status' };
    const values: Record<string, unknown> = { ':status': status, ':updatedAt': now };

    if (extra.sfnExecutionArn !== undefined) {
        updates.push('sfnExecutionArn = :sfnArn');
        values[':sfnArn'] = extra.sfnExecutionArn;
    }
    if (extra.sfnTaskToken !== undefined) {
        if (extra.sfnTaskToken === null) {
            updates.push('REMOVE sfnTaskToken');
        } else {
            updates.push('sfnTaskToken = :token');
            values[':token'] = extra.sfnTaskToken;
        }
    }
    if (extra.resultSummary !== undefined) {
        updates.push('resultSummary = :result');
        values[':result'] = extra.resultSummary;
    }
    if (extra.approvalNote !== undefined) {
        updates.push('approvalNote = :note');
        values[':note'] = extra.approvalNote;
    }
    if (extra.rejectionReason !== undefined) {
        updates.push('rejectionReason = :reason');
        values[':reason'] = extra.rejectionReason;
    }
    if (extra.approvedBy !== undefined) {
        updates.push('approvedBy = :approvedBy');
        values[':approvedBy'] = extra.approvedBy;
    }

    const setUpdates = updates.filter((u) => !u.startsWith('REMOVE'));
    const removeUpdates = updates.filter((u) => u.startsWith('REMOVE')).map((u) => u.slice(7));

    let expr = `SET ${setUpdates.join(', ')}`;
    if (removeUpdates.length) expr += ` REMOVE ${removeUpdates.join(', ')}`;

    await ddb.send(
        new UpdateCommand({
            TableName: TABLE(),
            Key: { PK: `USER#${userId}`, SK: `ANALYSIS#${analysisId}` },
            UpdateExpression: expr,
            ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
            ExpressionAttributeValues: values,
        }),
    );
}
