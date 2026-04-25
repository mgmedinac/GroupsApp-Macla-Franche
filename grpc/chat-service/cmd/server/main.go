package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"os"
	"time"

	"groupsapp/grpc/chat-service/internal/client"
	"groupsapp/grpc/chat-service/internal/repository"
	"groupsapp/grpc/chat-service/internal/server"
	"groupsapp/grpc/chat-service/internal/service"
	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	addr := getenv("CHAT_GRPC_ADDR", ":50051")
	dbDSN := getenv("CHAT_DB_DSN", "postgres://chat_user:chat_pass@chat-db:5432/chat_db?sslmode=disable")
	userGRPCAddr := getenv("USER_GRPC_ADDR", "user-grpc:50053")

	db, err := sql.Open("postgres", dbDSN)
	if err != nil {
		log.Fatalf("open postgres failed: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("postgres ping failed: %v", err)
	}

	msgRepo := repository.NewPostgresMessageRepository(db)
	ctxSchema, cancelSchema := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancelSchema()
	if err := msgRepo.EnsureSchema(ctxSchema); err != nil {
		log.Fatalf("ensure schema failed: %v", err)
	}

	conn, userClient, err := client.NewGRPCUserClient(userGRPCAddr)
	if err != nil {
		log.Fatalf("connect to user-service gRPC failed: %v", err)
	}
	defer conn.Close()

	svc := service.NewChatService(msgRepo, userClient)
	grpcSrv := server.NewChatGRPCServer(svc)

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("listen failed: %v", err)
	}

	s := grpc.NewServer()
	groupsappv1.RegisterChatServiceServer(s, grpcSrv)
	reflection.Register(s)

	log.Printf("chat-service gRPC listening on %s", addr)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("serve failed: %v", err)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
