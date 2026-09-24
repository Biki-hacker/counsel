package config

import (
	"os"
	"testing"
)

func TestConfigDefaultsAndEnvOverrides(t *testing.T) {
	// Set test environment overrides
	os.Setenv("PORT", "9090")
	os.Setenv("ENV", "production")
	os.Setenv("DEBUG_MODE", "true")
	os.Setenv("DAILY_QUOTA_ALLOWANCE", "250")
	os.Setenv("ALLOWED_ORIGINS", "https://app.counsel.law, https://staging.counsel.law")

	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("ENV")
		os.Unsetenv("DEBUG_MODE")
		os.Unsetenv("DAILY_QUOTA_ALLOWANCE")
		os.Unsetenv("ALLOWED_ORIGINS")
	}()

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("Expected port 9090, got %s", cfg.Port)
	}
	if cfg.Env != "production" {
		t.Errorf("Expected env production, got %s", cfg.Env)
	}
	if !cfg.DebugMode {
		t.Errorf("Expected DebugMode to be true")
	}
	if cfg.DailyQuotaAllowance != 250 {
		t.Errorf("Expected DailyQuotaAllowance 250, got %d", cfg.DailyQuotaAllowance)
	}
	if len(cfg.AllowedOrigins) != 2 || cfg.AllowedOrigins[0] != "https://app.counsel.law" || cfg.AllowedOrigins[1] != "https://staging.counsel.law" {
		t.Errorf("AllowedOrigins parsed incorrectly: %v", cfg.AllowedOrigins)
	}
}

func TestConfigHelperFunctions(t *testing.T) {
	// Test getEnv
	os.Setenv("TEST_KEY", "custom_value")
	defer os.Unsetenv("TEST_KEY")

	if val := getEnv("TEST_KEY", "default"); val != "custom_value" {
		t.Errorf("Expected custom_value, got %s", val)
	}
	if val := getEnv("NON_EXISTENT_KEY", "fallback"); val != "fallback" {
		t.Errorf("Expected fallback, got %s", val)
	}

	// Test getEnvBool
	os.Setenv("TEST_BOOL", "true")
	defer os.Unsetenv("TEST_BOOL")
	if !getEnvBool("TEST_BOOL", false) {
		t.Errorf("Expected true for getEnvBool")
	}

	// Test getEnvInt
	os.Setenv("TEST_INT", "42")
	defer os.Unsetenv("TEST_INT")
	if val := getEnvInt("TEST_INT", 0); val != 42 {
		t.Errorf("Expected 42, got %d", val)
	}

	// Test getEnvInt64
	os.Setenv("TEST_INT64", "9999999999")
	defer os.Unsetenv("TEST_INT64")
	if val := getEnvInt64("TEST_INT64", 0); val != 9999999999 {
		t.Errorf("Expected 9999999999, got %d", val)
	}
}
