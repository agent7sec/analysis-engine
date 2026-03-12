/**
 * DynamoDB client singleton.
 * Uses the DocumentClient for idiomatic JS/TS attribute marshalling.
 */

import {
    DynamoDBClient,
    type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    ScanCommand,
    type GetCommandInput,
    type PutCommandInput,
    type UpdateCommandInput,
    type QueryCommandInput,
    type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';

const clientConfig: DynamoDBClientConfig = {
    region: config.aws.region,
    ...(config.aws.endpoint
        ? { endpoint: config.aws.endpoint }
        : {}),
};

const raw = new DynamoDBClient(clientConfig);

export const ddb = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
});

// Re-export commands for convenience
export {
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    ScanCommand,
    type GetCommandInput,
    type PutCommandInput,
    type UpdateCommandInput,
    type QueryCommandInput,
    type ScanCommandInput,
};
