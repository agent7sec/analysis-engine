#!/usr/bin/env bash
set -euo pipefail

# Build all Lambda handlers into individual bundles via esbuild
# Each handler becomes its own dist/<name>.js (external: @aws-sdk/* provided by runtime)

HANDLERS=(
  "src/handlers/authorizer"
  "src/handlers/upload-presigned-url"
  "src/handlers/upload-complete"
  "src/handlers/analysis-status"
  "src/handlers/certificate-download"
  "src/handlers/hitl-approval"
  "src/handlers/sqs-consumer"
  "src/handlers/store-task-token"
  "src/handlers/check-semantic-cache"
  "src/handlers/certificate-generator"
  "src/handlers/health"
)

mkdir -p dist/handlers

for handler in "${HANDLERS[@]}"; do
  name=$(basename "$handler")
  echo "Building $name..."
  npx esbuild "$handler.ts" \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=esm \
    --external:@aws-sdk/* \
    --external:pdfkit \
    --outfile="dist/handlers/$name.js"
done

echo "✅ All handlers built to dist/handlers/"
