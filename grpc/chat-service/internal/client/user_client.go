package client

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type UserClient interface {
	GetUserByID(ctx context.Context, userID int64) (*groupsappv1.User, error)
}

type GRPCUserClient struct {
	client groupsappv1.UserServiceClient
}

func NewGRPCUserClient(addr string) (*grpc.ClientConn, *GRPCUserClient, error) {
	maxRetries := envInt("USER_GRPC_MAX_RETRIES", 10)
	initialBackoff := time.Duration(envInt("USER_GRPC_INITIAL_BACKOFF_MS", 500)) * time.Millisecond
	maxBackoff := time.Duration(envInt("USER_GRPC_MAX_BACKOFF_MS", 5000)) * time.Millisecond

	backoff := initialBackoff
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		conn, err := grpc.DialContext(ctx, addr, grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
		cancel()
		if err == nil {
			log.Printf("connected to user-service gRPC at %s (attempt %d/%d)", addr, attempt, maxRetries)
			c := groupsappv1.NewUserServiceClient(conn)
			return conn, &GRPCUserClient{client: c}, nil
		}

		lastErr = err
		if attempt < maxRetries {
			log.Printf("failed to connect to user-service gRPC at %s (attempt %d/%d): %v; retrying in %s", addr, attempt, maxRetries, err, backoff)
			time.Sleep(backoff)
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}

	return nil, nil, fmt.Errorf("failed to connect to user-service gRPC after %d attempts: %w", maxRetries, lastErr)
}

func (c *GRPCUserClient) GetUserByID(ctx context.Context, userID int64) (*groupsappv1.User, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := c.client.GetUserById(timeoutCtx, &groupsappv1.GetUserByIdRequest{UserId: userID})
	if err != nil {
		return nil, err
	}
	return resp.GetUser(), nil
}

func envInt(name string, fallback int) int {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
