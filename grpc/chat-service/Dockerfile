FROM golang:1.22-alpine AS builder

RUN apk add --no-cache build-base

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY gen ./gen
COPY chat-service ./chat-service

RUN CGO_ENABLED=1 GOOS=linux go build -o /bin/chat-grpc ./chat-service/cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates netcat-openbsd
WORKDIR /app
COPY --from=builder /bin/chat-grpc /app/chat-grpc

EXPOSE 50051
CMD ["/app/chat-grpc"]
