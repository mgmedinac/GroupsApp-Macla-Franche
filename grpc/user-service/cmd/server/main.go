package main

import (
	"database/sql"
	"log"
	"net"
	"os"

	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"
	"groupsapp/grpc/user-service/internal/auth"
	"groupsapp/grpc/user-service/internal/repository"
	"groupsapp/grpc/user-service/internal/server"
	"groupsapp/grpc/user-service/internal/service"

	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	addr := getenv("USER_GRPC_ADDR", ":50053")
	dbDSN := getenv("USER_DB_DSN", "postgres://auth_user:auth_pass@auth-db:5432/auth_db?sslmode=disable")
	jwtSecret := getenv("JWT_SECRET", "super_secret_jwt_key")

	db, err := sql.Open("postgres", dbDSN)
	if err != nil {
		log.Fatalf("open postgres failed: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("postgres ping failed: %v", err)
	}

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("listen failed: %v", err)
	}

	repo := repository.NewPostgresUserRepository(db)
	validator := auth.NewValidator(jwtSecret)
	svc := service.NewUserService(repo, validator)
	grpcSrv := server.NewUserGRPCServer(svc)

	s := grpc.NewServer()
	groupsappv1.RegisterUserServiceServer(s, grpcSrv)
	reflection.Register(s)

	log.Printf("user-service gRPC listening on %s", addr)
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
