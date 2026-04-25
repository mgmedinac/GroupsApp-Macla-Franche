package repository

import (
	"context"
	"database/sql"
)

type User struct {
	ID       int64
	Username string
	Online   bool
	LastSeen string
}

type UserRepository interface {
	GetUserByID(ctx context.Context, id int64) (*User, error)
}

type PostgresUserRepository struct {
	db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

func (r *PostgresUserRepository) GetUserByID(ctx context.Context, id int64) (*User, error) {
	var user User
	row := r.db.QueryRowContext(ctx, `SELECT id, username, online, COALESCE(last_seen::text, '') FROM users WHERE id = $1`, id)
	if err := row.Scan(&user.ID, &user.Username, &user.Online, &user.LastSeen); err != nil {
		return nil, err
	}
	return &user, nil
}
