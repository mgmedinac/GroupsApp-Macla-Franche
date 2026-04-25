# gRPC Internal Communication (Go)

This folder adds synchronous internal communication with gRPC for GroupsApp.

## Services

- `user-service`: Implements `UserService` (`GetUserById`, `ValidateToken`)
- `chat-service`: Implements `ChatService` (`SendMessage`, `GetMessages`) and uses a gRPC client to `UserService`

## Structure

- `proto/`: .proto contracts
- `gen/`: generated Go stubs
- `user-service/`: user gRPC server
- `chat-service/`: chat gRPC server + user gRPC client
- `scripts/generate.sh`: protoc generation script
- `k8s/`: Kubernetes manifests for internal gRPC services

## Generate stubs

```bash
cd grpc
chmod +x scripts/generate.sh
./scripts/generate.sh
```

## Run locally

```bash
cd grpc
# terminal 1
USER_DB_PATH=../services/auth/auth.db JWT_SECRET=super_secret_jwt_key go run ./user-service/cmd/server

# terminal 2
CHAT_DB_PATH=../services/chat/chat.db USER_GRPC_ADDR=localhost:50051 go run ./chat-service/cmd/server
```

## Docker

Use Dockerfiles:

- `user-service/Dockerfile`
- `chat-service/Dockerfile`

## Kubernetes

Apply manifests in `grpc/k8s/`.
