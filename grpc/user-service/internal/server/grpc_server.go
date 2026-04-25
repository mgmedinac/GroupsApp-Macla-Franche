package server

import (
	"context"
	"database/sql"

	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"
	"groupsapp/grpc/user-service/internal/repository"
	"groupsapp/grpc/user-service/internal/service"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserGRPCServer struct {
	groupsappv1.UnimplementedUserServiceServer
	svc *service.UserService
}

func NewUserGRPCServer(svc *service.UserService) *UserGRPCServer {
	return &UserGRPCServer{svc: svc}
}

func (s *UserGRPCServer) GetUserById(ctx context.Context, req *groupsappv1.GetUserByIdRequest) (*groupsappv1.GetUserByIdResponse, error) {
	if req.GetUserId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "user_id must be > 0")
	}

	user, err := s.svc.GetUserByID(ctx, req.GetUserId())
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "user not found")
		}
		return nil, status.Errorf(codes.Internal, "get user failed: %v", err)
	}

	return &groupsappv1.GetUserByIdResponse{User: mapUser(user)}, nil
}

func (s *UserGRPCServer) ValidateToken(ctx context.Context, req *groupsappv1.ValidateTokenRequest) (*groupsappv1.ValidateTokenResponse, error) {
	if req.GetToken() == "" {
		return nil, status.Error(codes.InvalidArgument, "token is required")
	}

	user, err := s.svc.ValidateToken(ctx, req.GetToken())
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.Unauthenticated, "token valid but user not found")
		}
		return nil, status.Errorf(codes.Unauthenticated, "invalid token: %v", err)
	}

	return &groupsappv1.ValidateTokenResponse{User: mapUser(user)}, nil
}

func mapUser(user *repository.User) *groupsappv1.User {
	return &groupsappv1.User{
		Id:       user.ID,
		Username: user.Username,
		Online:   user.Online,
		LastSeen: user.LastSeen,
	}
}
