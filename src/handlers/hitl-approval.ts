/**
 * HITL approve/reject handlers
 * POST /analyses/{id}/approve
 * POST /analyses/{id}/reject
 */

import type { APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { APIGatewayEventRequestContextV2WithAuthorizer } from 'aws-lambda';
import { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } from '@aws-sdk/client-sfn';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { badRequest, ok, internalError, unauthorized, notFound } from '../http.js';
import { getAnalysisByIdAdmin, updateAnalysisStatus } from '../repositories/analysis.repository.js';

interface AuthContext { userId: string; tenantId: string; email: string; }
type Event = APIGatewayProxyEventV2WithRequestContext<
    APIGatewayEventRequestContextV2WithAuthorizer<AuthContext>
>;

const sfn = new SFNClient({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint } : {}),
});

interface ApproveBody { approval_note?: string; }
interface RejectBody { rejection_reason: string; }

export const approveHandler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const id = event.pathParameters?.['id'];
        if (!id) return badRequest('Analysis ID missing');

        // Admin lookup — doesn't know the original userId
        const analysis = await getAnalysisByIdAdmin(id);
        if (!analysis) return notFound('Analysis not found');
        if (analysis.status !== 'PENDING_APPROVAL') {
            return badRequest(`Analysis is in status ${analysis.status}, expected PENDING_APPROVAL`);
        }
        if (!analysis.sfnTaskToken) return internalError('Missing task token');

        const body = parseBody<ApproveBody>(event.body);
        const approvalNote = body?.approval_note ?? '';

        await sfn.send(new SendTaskSuccessCommand({
            taskToken: analysis.sfnTaskToken,
            output: JSON.stringify({ approved: true, approvedBy: userId, approvalNote }),
        }));

        await updateAnalysisStatus(analysis.userId, id, 'APPROVED', {
            approvalNote,
            approvedBy: userId,
            sfnTaskToken: null,
        });

        logger.info('hitl.approved', { analysisId: id, approvedBy: userId });
        return ok({ analysis_id: id, status: 'APPROVED' });
    } catch (err) {
        logger.error('hitl.approve.error', { err });
        return internalError();
    }
};

export const rejectHandler = async (event: Event): Promise<APIGatewayProxyResultV2> => {
    try {
        const { userId } = event.requestContext.authorizer;
        if (!userId) return unauthorized();

        const id = event.pathParameters?.['id'];
        if (!id) return badRequest('Analysis ID missing');

        const analysis = await getAnalysisByIdAdmin(id);
        if (!analysis) return notFound('Analysis not found');
        if (analysis.status !== 'PENDING_APPROVAL') {
            return badRequest(`Analysis is in status ${analysis.status}, expected PENDING_APPROVAL`);
        }
        if (!analysis.sfnTaskToken) return internalError('Missing task token');

        const body = parseBody<RejectBody>(event.body);
        const rejectionReason = body?.rejection_reason ?? 'Rejected by administrator';

        await sfn.send(new SendTaskFailureCommand({
            taskToken: analysis.sfnTaskToken,
            error: 'HumanRejection',
            cause: rejectionReason,
        }));

        await updateAnalysisStatus(analysis.userId, id, 'REJECTED', {
            rejectionReason,
            approvedBy: userId,
            sfnTaskToken: null,
        });

        logger.info('hitl.rejected', { analysisId: id, rejectedBy: userId });
        return ok({ analysis_id: id, status: 'REJECTED' });
    } catch (err) {
        logger.error('hitl.reject.error', { err });
        return internalError();
    }
};

function parseBody<T>(raw: string | null | undefined): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
}
