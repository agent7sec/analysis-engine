/**
 * StoreTaskToken Lambda
 * Called by Step Functions during WaitForHumanApproval.
 */

import { logger } from '../logger.js';
import { updateAnalysisStatus } from '../repositories/analysis.repository.js';

interface Input {
    analysisId: string;
    tenantId: string;
    userId: string;
    taskToken: string;
    batchResult?: unknown;
}

export const handler = async (input: Input): Promise<void> => {
    logger.info('store-task-token.start', { analysisId: input.analysisId });

    await updateAnalysisStatus(input.userId, input.analysisId, 'PENDING_APPROVAL', {
        sfnTaskToken: input.taskToken,
        resultSummary: input.batchResult,
    });

    logger.info('store-task-token.done', { analysisId: input.analysisId });
};
