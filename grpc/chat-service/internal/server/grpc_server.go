package server

import (
	"context"
	"strings"

	groupsappv1 "groupsapp/grpc/gen/groupsapp/v1"
	"groupsapp/grpc/chat-service/internal/repository"
	"groupsapp/grpc/chat-service/internal/service"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ChatGRPCServer struct {
	groupsappv1.UnimplementedChatServiceServer
	svc *service.ChatService
}

func NewChatGRPCServer(svc *service.ChatService) *ChatGRPCServer {
	return &ChatGRPCServer{svc: svc}
}

func (s *ChatGRPCServer) SendMessage(ctx context.Context, req *groupsappv1.SendMessageRequest) (*groupsappv1.SendMessageResponse, error) {
	if req.GetGroupId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "group_id must be > 0")
	}
	if req.GetUserId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "user_id must be > 0")
	}
	if strings.TrimSpace(req.GetContent()) == "" && strings.TrimSpace(req.GetFileUrl()) == "" {
		return nil, status.Error(codes.InvalidArgument, "content or file_url is required")
	}

	message, err := s.svc.SendMessage(ctx, req.GetGroupId(), req.GetUserId(), req.GetContent(), req.GetFileUrl())
	if err != nil {
		if strings.Contains(err.Error(), "rpc error") {
			return nil, status.Errorf(codes.FailedPrecondition, "user validation failed: %v", err)
		}
		return nil, status.Errorf(codes.Internal, "send message failed: %v", err)
	}

	return &groupsappv1.SendMessageResponse{Message: mapMessage(message)}, nil
}

func (s *ChatGRPCServer) GetMessages(ctx context.Context, req *groupsappv1.GetMessagesRequest) (*groupsappv1.GetMessagesResponse, error) {
	if req.GetGroupId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "group_id must be > 0")
	}

	messages, err := s.svc.GetMessages(ctx, req.GetGroupId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get messages failed: %v", err)
	}

	out := make([]*groupsappv1.Message, 0, len(messages))
	for _, msg := range messages {
		out = append(out, mapMessage(msg))
	}

	return &groupsappv1.GetMessagesResponse{Messages: out}, nil
}

func mapMessage(msg *repository.Message) *groupsappv1.Message {
	return &groupsappv1.Message{
		Id:        msg.ID,
		GroupId:   msg.GroupID,
		UserId:    msg.UserID,
		Content:   msg.Content,
		FileUrl:   msg.FileURL,
		CreatedAt: msg.CreatedAt,
		IsRead:    msg.IsRead,
		Status:    msg.Status,
	}
}
