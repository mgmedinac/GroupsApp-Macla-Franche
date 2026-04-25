package auth

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/golang-jwt/jwt/v5"
)

type Validator struct {
	secret []byte
}

type Claims struct {
	UserID int64
}

func NewValidator(secret string) *Validator {
	return &Validator{secret: []byte(secret)}
}

func (v *Validator) ParseToken(token string) (*Claims, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return v.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("invalid token")
	}

	claimsMap, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}

	userID, err := extractInt64(claimsMap["user_id"])
	if err != nil {
		return nil, errors.New("missing or invalid user_id claim")
	}

	return &Claims{UserID: userID}, nil
}

func extractInt64(value interface{}) (int64, error) {
	switch t := value.(type) {
	case float64:
		return int64(t), nil
	case int64:
		return t, nil
	case string:
		return strconv.ParseInt(t, 10, 64)
	default:
		return 0, errors.New("unsupported claim type")
	}
}
