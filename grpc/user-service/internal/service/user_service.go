package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"groupsapp/grpc/user-service/internal/auth"
	"groupsapp/grpc/user-service/internal/repository"
)

type UserService struct {
	repo      repository.UserRepository
	validator *auth.Validator
}

func NewUserService(repo repository.UserRepository, validator *auth.Validator) *UserService {
	return &UserService{repo: repo, validator: validator}
}

func (s *UserService) GetUserByID(ctx context.Context, id int64) (*repository.User, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return s.repo.GetUserByID(ctx, id)
}

func (s *UserService) ValidateToken(ctx context.Context, token string) (*repository.User, error) {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return nil, errors.New("token is empty")
	}

	claims, err := s.validator.ParseToken(trimmed)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	user, err := s.repo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, err
	}

	return user, nil
}
