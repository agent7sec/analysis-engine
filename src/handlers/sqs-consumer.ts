/**
 * SQS Consumer Lambda
 *
 * Triggered by the SQS analysis queue.
 * Starts a Step Functions execution for each uploaded file.
 */

import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { updateAnalysisStatus } from '../repositories/analysis.repository.js';

const sfn = new SFNClient({
    region: config.aws.region,
    ...(config.aws.endpoint ? { endpoint: config.aws.endpoint } : {}),
});

interface QueueMessage {
    analysisId: string;
    tenantId: string;
    userId: string;
    s3Bucket: string;
    s3Key: string;
    fileName: string;
    enqueuedAt: string;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const itemFailures: SQSBatchResponse['batchItemFailures'] = [];

    for (const record of event.Records) {
        let msg: QueueMessage | null = null;
        try {
            msg = JSON.parse(record.body) as QueueMessage;

            logger.info('sqs-consumer.starting', {
                analysisId: msg.analysisId,
                s3Key: msg.s3Key,
            });

            const executionName = `${msg.analysisId}-${uuidv4().slice(0, 8)}`;

            const { executionArn } = await sfn.send(
                new StartExecutionCommand({
                    stateMachineArn: config.sfn.stateMachineArn,
                    name: executionName,
                    input: JSON.stringify({
                        analysisId: msg.analysisId,
                        tenantId: msg.tenantId,
                        userId: msg.userId,
                        s3Bucket: msg.s3Bucket,
                        s3Key: msg.s3Key,
                        fileName: msg.fileName,
                    }),
                }),
            );

            await updateAnalysisStatus(msg.analysisId, 'ANALYZING', {
                sfnExecutionArn: executionArn,
            });

            logger.info('sqs-consumer.started', {
                analysisId: msg.analysisId,
                executionArn,
            });
        } catch (err) {
            logger.error('sqs-consumer.error', { analysisId: msg?.analysisId, err });
            // Report failure so SQS can retry this message
            itemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    return { batchItemFailures: itemFailures };
};
