#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v protoc >/dev/null 2>&1; then
  echo "Error: protoc is required."
  exit 1
fi

if ! command -v protoc-gen-go >/dev/null 2>&1; then
  echo "Installing protoc-gen-go..."
  go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
fi

if ! command -v protoc-gen-go-grpc >/dev/null 2>&1; then
  echo "Installing protoc-gen-go-grpc..."
  go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
fi

export PATH="$(go env GOPATH)/bin:$PATH"

rm -rf gen
mkdir -p gen

protoc \
  --proto_path=proto \
  --go_out=gen --go_opt=paths=source_relative \
  --go-grpc_out=gen --go-grpc_opt=paths=source_relative \
  proto/groupsapp/v1/groupsapp.proto

echo "Stubs generated in $ROOT_DIR/gen"
