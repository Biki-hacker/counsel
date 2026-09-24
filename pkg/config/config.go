package config

import (
	"os"
	"strconv"
	"strings"
)

// Config aggregates all validated system configurations.
type Config struct {
	Port           string
	Env            string
	AllowedOrigins []string
	DebugMode      bool

	// OpenRouter
	OpenRouterKeyPrimary   string
	OpenRouterKeySecondary string
	OpenRouterBaseURL      string

	// Models
	ModelGoogleNormal   string
	ModelGoogleThinking string
	ModelNvidiaNormal   string
	ModelNvidiaThinking string
	ModelNvidiaOmni     string

	// Upstash Redis
	UpstashRedisURL   string
	UpstashRedisToken string

	// Firebase
	FirebaseProjectID   string
	FirebaseClientEmail string
	FirebasePrivateKey  string

	// Supabase
	SupabaseURL       string
	SupabaseAnonKey   string
	SupabaseJWTSecret string

	// Quotas & Limits
	MaxDocumentSizeBytes int64
	MaxPageCount         int
	DailyQuotaAllowance  int
	WeightBaseText       int
	WeightThinkingMult   int
	WeightExpertMult     int
	WeightCompareMult    int
}

// Load reads and validates configuration from environment variables.
func Load() *Config {
	loadDotEnv()

	port := getEnv("PORT", "8080")
	env := getEnv("ENV", "development")
	originsStr := getEnv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
	var origins []string
	for _, o := range strings.Split(originsStr, ",") {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	debugMode := getEnvBool("DEBUG_MODE", false)

	cfg := &Config{
		Port:                 port,
		Env:                  env,
		AllowedOrigins:       origins,
		DebugMode:            debugMode,
		OpenRouterKeyPrimary: strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY_PRIMARY")),
		OpenRouterKeySecondary: strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY_SECONDARY")),
		OpenRouterBaseURL:    getEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),

		ModelGoogleNormal:   getEnv("MODEL_GOOGLE_NORMAL", "google/gemma-4-26b-a4b-it:free"),
		ModelGoogleThinking: getEnv("MODEL_GOOGLE_THINKING", "google/gemma-4-31b-it:free"),
		ModelNvidiaNormal:   getEnv("MODEL_NVIDIA_NORMAL", "nvidia/nemotron-3-super-120b-a12b:free"),
		ModelNvidiaThinking: getEnv("MODEL_NVIDIA_THINKING", "nvidia/nemotron-3.5-lightning:free"),
		ModelNvidiaOmni:     getEnv("MODEL_NVIDIA_OMNI", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),

		UpstashRedisURL:   strings.TrimSpace(os.Getenv("UPSTASH_REDIS_REST_URL")),
		UpstashRedisToken: strings.TrimSpace(os.Getenv("UPSTASH_REDIS_REST_TOKEN")),

		FirebaseProjectID:   strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID")),
		FirebaseClientEmail: strings.TrimSpace(os.Getenv("FIREBASE_CLIENT_EMAIL")),
		FirebasePrivateKey:  strings.TrimSpace(os.Getenv("FIREBASE_PRIVATE_KEY")),

		SupabaseURL:       strings.TrimSpace(os.Getenv("SUPABASE_URL")),
		SupabaseAnonKey:   strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY")),
		SupabaseJWTSecret: strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET")),

		MaxDocumentSizeBytes: getEnvInt64("MAX_DOCUMENT_SIZE_BYTES", 20*1024*1024), // 20 MB
		MaxPageCount:         getEnvInt("MAX_PAGE_COUNT", 100),
		DailyQuotaAllowance:  getEnvInt("DAILY_QUOTA_ALLOWANCE", 100),
		WeightBaseText:       getEnvInt("WEIGHT_BASE_TEXT", 1),
		WeightThinkingMult:   getEnvInt("WEIGHT_THINKING_MULT", 2),
		WeightExpertMult:     getEnvInt("WEIGHT_EXPERT_MULT", 3),
		WeightCompareMult:    getEnvInt("WEIGHT_COMPARE_MULT", 3),
	}

	return cfg
}

func loadDotEnv() {
	candidates := []string{".env", "../.env", "../../.env"}
	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				// Strip quotes if wrapped
				if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
					val = val[1 : len(val)-1]
				}
				// Set only if not already explicitly set in environment
				if _, exists := os.LookupEnv(key); !exists {
					os.Setenv(key, val)
				}
			}
		}
		break // Stop after first existing file found
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && strings.TrimSpace(val) != "" {
		return val
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok {
		parsed, err := strconv.ParseBool(strings.TrimSpace(val))
		if err == nil {
			return parsed
		}
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val, ok := os.LookupEnv(key); ok {
		parsed, err := strconv.Atoi(strings.TrimSpace(val))
		if err == nil {
			return parsed
		}
	}
	return defaultVal
}

func getEnvInt64(key string, defaultVal int64) int64 {
	if val, ok := os.LookupEnv(key); ok {
		parsed, err := strconv.ParseInt(strings.TrimSpace(val), 10, 64)
		if err == nil {
			return parsed
		}
	}
	return defaultVal
}
