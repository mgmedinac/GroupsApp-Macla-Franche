package repository

import (
	"context"
	"database/sql"
	"time"
)

type Message struct {
	ID        int64
	GroupID   int64
	UserID    int64
	Content   string
	FileURL   string
	CreatedAt string
	IsRead    bool
	Status    string
}

type MessageRepository interface {
	InsertMessage(ctx context.Context, msg *Message) (*Message, error)
	ListMessagesByGroup(ctx context.Context, groupID int64) ([]*Message, error)
}

type PostgresMessageRepository struct {
	db *sql.DB
}

func NewPostgresMessageRepository(db *sql.DB) *PostgresMessageRepository {
	return &PostgresMessageRepository{db: db}
}

func (r *PostgresMessageRepository) EnsureSchema(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS grpc_messages (
			id BIGSERIAL PRIMARY KEY,
			group_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			content TEXT,
			file_url TEXT,
			created_at TIMESTAMPTZ NOT NULL,
			is_read BOOLEAN NOT NULL DEFAULT FALSE,
			status TEXT NOT NULL DEFAULT 'sent'
		)
	`)
	return err
}

func (r *PostgresMessageRepository) InsertMessage(ctx context.Context, msg *Message) (*Message, error) {
	now := time.Now().UTC()
	stored := &Message{}
	err := r.db.QueryRowContext(
		ctx,
		`INSERT INTO grpc_messages (group_id, user_id, content, file_url, created_at, is_read, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, group_id, user_id, COALESCE(content, ''), COALESCE(file_url, ''), created_at::text, is_read, status`,
		msg.GroupID,
		msg.UserID,
		msg.Content,
		msg.FileURL,
		now,
		false,
		"sent",
	).Scan(
		&stored.ID,
		&stored.GroupID,
		&stored.UserID,
		&stored.Content,
		&stored.FileURL,
		&stored.CreatedAt,
		&stored.IsRead,
		&stored.Status,
	)
	if err != nil {
		return nil, err
	}

	return stored, nil
}

func (r *PostgresMessageRepository) ListMessagesByGroup(ctx context.Context, groupID int64) ([]*Message, error) {
	rows, err := r.db.QueryContext(
		ctx,
		`SELECT id, group_id, user_id, COALESCE(content, ''), COALESCE(file_url, ''), created_at::text, is_read, status
		 FROM grpc_messages
		 WHERE group_id = $1
		 ORDER BY created_at ASC`,
		groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]*Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.GroupID, &m.UserID, &m.Content, &m.FileURL, &m.CreatedAt, &m.IsRead, &m.Status); err != nil {
			return nil, err
		}
		result = append(result, &m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
