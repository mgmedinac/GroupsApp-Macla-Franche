FROM golang:1.22-alpine AS builder

RUN apk add --no-cache build-base

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY gen ./gen
COPY user-service ./user-service

RUN CGO_ENABLED=1 GOOS=linux go build -o /bin/user-grpc ./user-service/cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates netcat-openbsd
WORKDIR /app
COPY --from=builder /bin/user-grpc /app/user-grpc

EXPOSE 50053
CMD ["/app/user-grpc"]
