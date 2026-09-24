package logger

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestLoggerSanitization(t *testing.T) {
	var buf bytes.Buffer
	l := &Logger{out: &buf, debugMode: true}

	fields := map[string]any{
		"apiKey":       "sensitive-openrouter-key",
		"userToken":    "bearer-token-12345",
		"auth_secret":  "super-secret-jwt",
		"public_field": "safe-value",
	}

	l.log(LevelInfo, "test security", &LogEntry{Fields: fields})

	output := buf.String()
	var decoded LogEntry
	if err := json.Unmarshal([]byte(output), &decoded); err != nil {
		t.Fatalf("Failed to decode log json: %v", err)
	}

	if decoded.Fields["apiKey"] != "[REDACTED]" {
		t.Errorf("Expected apiKey to be redacted, got: %v", decoded.Fields["apiKey"])
	}
	if decoded.Fields["userToken"] != "[REDACTED]" {
		t.Errorf("Expected userToken to be redacted, got: %v", decoded.Fields["userToken"])
	}
	if decoded.Fields["auth_secret"] != "[REDACTED]" {
		t.Errorf("Expected auth_secret to be redacted, got: %v", decoded.Fields["auth_secret"])
	}
	if decoded.Fields["public_field"] != "safe-value" {
		t.Errorf("Expected public_field to be preserved, got: %v", decoded.Fields["public_field"])
	}
}

func TestLoggerDebugFilter(t *testing.T) {
	var buf bytes.Buffer
	l := &Logger{out: &buf, debugMode: false}

	l.log(LevelDebug, "debug message should be dropped", nil)
	if buf.Len() != 0 {
		t.Errorf("Expected debug message to be dropped when debugMode is false")
	}

	l.debugMode = true
	l.log(LevelDebug, "debug message should be recorded", nil)
	if !strings.Contains(buf.String(), "debug message should be recorded") {
		t.Errorf("Expected debug message to be recorded when debugMode is true")
	}
}
