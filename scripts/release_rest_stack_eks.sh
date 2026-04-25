#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-849194575776}"
NAMESPACE="${NAMESPACE:-groupsapp}"
TAG="${TAG:-v2026.04.24-1}"

AUTH_REPO="${AUTH_REPO:-$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/auth-service}"
CHAT_REPO="${CHAT_REPO:-$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/groupsapp/chat-service}"
FILE_REPO="${FILE_REPO:-$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/file-service}"
WEB_REPO="${WEB_REPO:-$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/groupsapp/web-frontend}"

AUTH_IMAGE="$AUTH_REPO:$TAG"
CHAT_IMAGE="$CHAT_REPO:$TAG"
FILE_IMAGE="$FILE_REPO:$TAG"
WEB_IMAGE="$WEB_REPO:$TAG"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: command '$1' not found"
    exit 1
  fi
}

require_cmd aws
require_cmd docker
require_cmd kubectl

if ! docker buildx version >/dev/null 2>&1; then
  echo "Error: docker buildx is required"
  exit 1
fi

echo "[1/8] Login to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "[2/8] Ensure buildx builder"
if ! docker buildx inspect groupsapp-builder >/dev/null 2>&1; then
  docker buildx create --name groupsapp-builder --use >/dev/null
else
  docker buildx use groupsapp-builder
fi

echo "[3/8] Build and push auth-service: $AUTH_IMAGE"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$AUTH_IMAGE" \
  --push \
  "$PROJECT_ROOT/services/auth"

echo "[4/8] Build and push chat-service: $CHAT_IMAGE"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$CHAT_IMAGE" \
  --push \
  "$PROJECT_ROOT/services/chat"

echo "[5/8] Build and push file-service: $FILE_IMAGE"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$FILE_IMAGE" \
  --push \
  "$PROJECT_ROOT/services/file"

echo "[6/8] Build and push web-frontend: $WEB_IMAGE"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f "$PROJECT_ROOT/services/web/Dockerfile" \
  -t "$WEB_IMAGE" \
  --push \
  "$PROJECT_ROOT"

echo "[7/8] Apply k8s manifests"
kubectl apply -f "$PROJECT_ROOT/k8s/auth-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/chat-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/file-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/web-frontend.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/ingress.yaml"

echo "[8/8] Wait for rollout"
kubectl rollout status deployment/auth-service -n "$NAMESPACE" --timeout=240s
kubectl rollout status deployment/chat-service -n "$NAMESPACE" --timeout=240s
kubectl rollout status deployment/file-service -n "$NAMESPACE" --timeout=240s
kubectl rollout status deployment/web-frontend -n "$NAMESPACE" --timeout=240s

echo "Release completed with tag: $TAG"
echo "AUTH_IMAGE=$AUTH_IMAGE"
echo "CHAT_IMAGE=$CHAT_IMAGE"
echo "FILE_IMAGE=$FILE_IMAGE"
echo "WEB_IMAGE=$WEB_IMAGE"
