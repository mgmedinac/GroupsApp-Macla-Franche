package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"groupsapp/grpc/chat-service/internal/client"
	"groupsapp/grpc/chat-service/internal/repository"
)

type ChatService struct {
	repo       repository.MessageRepository
	userClient client.UserClient
}

func NewChatService(repo repository.MessageRepository, userClient client.UserClient) *ChatService {
	return &ChatService{repo: repo, userClient: userClient}
}

func (s *ChatService) SendMessage(ctx context.Context, groupID, userID int64, content, fileURL string) (*repository.Message, error) {
	if groupID <= 0 {
		return nil, errors.New("group_id must be > 0")
	}
	if userID <= 0 {
		return nil, errors.New("user_id must be > 0")
	}
	if strings.TrimSpace(content) == "" && strings.TrimSpace(fileURL) == "" {
		return nil, errors.New("content or file_url is required")
	}

	ctxValidate, cancelValidate := context.WithTimeout(ctx, 2*time.Second)
	defer cancelValidate()
	if _, err := s.userClient.GetUserByID(ctxValidate, userID); err != nil {
		return nil, err
	}

	ctxInsert, cancelInsert := context.WithTimeout(ctx, 2*time.Second)
	defer cancelInsert()
	return s.repo.InsertMessage(ctxInsert, &repository.Message{
		GroupID: groupID,
		UserID:  userID,
		Content: strings.TrimSpace(content),
		FileURL: strings.TrimSpace(fileURL),
	})
}

func (s *ChatService) GetMessages(ctx context.Context, groupID int64) ([]*repository.Message, error) {
	if groupID <= 0 {
		return nil, errors.New("group_id must be > 0")
	}

	ctxList, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return s.repo.ListMessagesByGroup(ctxList, groupID)
}
