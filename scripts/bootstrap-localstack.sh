#!/usr/bin/env bash
# Bootstrap LocalStack resources for local development
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"

echo "Bootstrapping LocalStack at $ENDPOINT..."

# S3 Buckets
for bucket in s3-staging-uploads s3-processing-uploads s3-quarantine s3-output-certificates; do
  aws --endpoint-url="$ENDPOINT" --region="$REGION" s3 mb "s3://$bucket" 2>/dev/null || true
done

# SQS Queues
aws --endpoint-url="$ENDPOINT" --region="$REGION" sqs create-queue --queue-name analysis-queue 2>/dev/null || true
aws --endpoint-url="$ENDPOINT" --region="$REGION" sqs create-queue --queue-name analysis-dlq   2>/dev/null || true

# DynamoDB — analyses table with GSIs
aws --endpoint-url="$ENDPOINT" --region="$REGION" dynamodb create-table \
  --table-name analyses \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
    AttributeName=analysisId,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "StatusIndex",
        "KeySchema": [
          {"AttributeName": "status", "KeyType": "HASH"},
          {"AttributeName": "createdAt", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      },
      {
        "IndexName": "AnalysisIdIndex",
        "KeySchema": [
          {"AttributeName": "analysisId", "KeyType": "HASH"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]' 2>/dev/null || true

# DynamoDB — certificates table
aws --endpoint-url="$ENDPOINT" --region="$REGION" dynamodb create-table \
  --table-name certificates \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  2>/dev/null || true

echo "✅ LocalStack resources bootstrapped"
echo "SQS URL: http://localhost:4566/000000000000/analysis-queue"
echo "DynamoDB tables: analyses, certificates"
