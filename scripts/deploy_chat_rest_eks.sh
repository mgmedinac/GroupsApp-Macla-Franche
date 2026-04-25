#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-849194575776}"
NAMESPACE="${NAMESPACE:-groupsapp}"
IMAGE_REPO="${IMAGE_REPO:-$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/groupsapp/chat-service}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_URI="$IMAGE_REPO:$IMAGE_TAG"

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

echo "[1/6] Login to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "[2/6] Ensure buildx builder"
if ! docker buildx inspect groupsapp-builder >/dev/null 2>&1; then
  docker buildx create --name groupsapp-builder --use >/dev/null
else
  docker buildx use groupsapp-builder
fi

echo "[3/6] Build and push multi-arch image: $IMAGE_URI"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$IMAGE_URI" \
  --push \
  "$PROJECT_ROOT/services/chat"

echo "[4/6] Apply manifests"
kubectl apply -f "$PROJECT_ROOT/k8s/chat-service.yaml"
kubectl apply -f "$PROJECT_ROOT/k8s/ingress.yaml"

echo "[5/6] Rollout restart chat-service"
kubectl rollout restart deployment/chat-service -n "$NAMESPACE"
kubectl rollout status deployment/chat-service -n "$NAMESPACE" --timeout=180s

echo "[6/6] Verify pods"
kubectl get pods -n "$NAMESPACE" -l app=chat-service -o wide

echo "Done. chat-service REST deployed with multi-arch image: $IMAGE_URI"
