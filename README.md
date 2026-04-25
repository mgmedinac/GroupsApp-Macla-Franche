
Plataforma de chat implementada exclusivamente como arquitectura de microservicios.

## Servicios

- `services/auth`: autenticación, usuarios, JWT y presencia.
- `services/chat`: grupos, membresías, mensajes grupales, contactos y mensajes directos.
- `services/file`: carga de archivos y publicación de eventos en RabbitMQ.
- `services/web`: frontend SPA servido por Nginx.
- `k8s/consul`: servicio de coordinación para descubrimiento y health checks internos.
- `grpc/user-service`: servicio gRPC de usuarios y validación de token.
- `grpc/chat-service`: servicio gRPC de mensajería grupal.

## Comunicación

- REST: frontend y servicios Python.
- gRPC: comunicación interna `chat-grpc -> user-grpc`.
- RabbitMQ: eventos de dominio (`file.uploaded`) emitidos por `file-service`.

## Ejecutar con Docker Compose

```bash
docker compose up --build
```

## Release versionado a EKS (sin latest)

Para construir y publicar imagenes multi-arquitectura (`linux/amd64,linux/arm64`) y desplegar el stack REST con un tag inmutable:

```bash
TAG=v2026.04.24-1 AWS_REGION=us-east-1 AWS_ACCOUNT_ID=849194575776 NAMESPACE=groupsapp \
bash scripts/release_rest_stack_eks.sh
```

Este script actualiza y espera rollout de:
- `auth-service`
- `chat-service`
- `file-service`
- `web-frontend`

## Endpoints principales locales

- Frontend: `http://localhost:8080`
- Auth REST: `http://localhost:8001`
- Chat REST: `http://localhost:8002`
- File REST: `http://localhost:8003`
- RabbitMQ UI: `http://localhost:15672`
- Consul UI (port-forward): `http://localhost:8500`
- user-grpc: `localhost:50053`
- chat-grpc: `localhost:50051`
