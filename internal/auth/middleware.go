package auth

import (
	"context"
	"encoding/json"
	"net/http"

	"counsel/internal/models"
)

type contextKey string

const userContextKey contextKey = "counsel.user"

// Middleware creates an HTTP authentication middleware.
func Middleware(verifier *Verifier, manager *CanonicalAuthManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := r.Header.Get("Authorization")
			if tokenStr == "" {
				// Also check query param ?token= (useful for browser events / initial handshake)
				tokenStr = r.URL.Query().Get("token")
			}

			if tokenStr == "" {
				httpError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing authorization token")
				return
			}

			payload, err := verifier.VerifyToken(r.Context(), tokenStr)
			if err != nil {
				httpError(w, http.StatusUnauthorized, "INVALID_TOKEN", err.Error())
				return
			}

			user, err := manager.ResolveUser(r.Context(), payload)
			if err != nil {
				if errorsIs(err, ErrAccountConflict) {
					httpError(w, http.StatusConflict, "ACCOUNT_CONFLICT", "An account already exists with this email. Please sign in with your original method.")
					return
				}
				httpError(w, http.StatusInternalServerError, "AUTH_ERROR", "Failed to resolve user account")
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserFromContext retrieves the authenticated user from the context.
func UserFromContext(ctx context.Context) (*models.CanonicalUser, bool) {
	u, ok := ctx.Value(userContextKey).(*models.CanonicalUser)
	return u, ok && u != nil
}

func httpError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

func errorsIs(err, target error) bool {
	if err == nil || target == nil {
		return err == target
	}
	return err.Error() == target.Error()
}
