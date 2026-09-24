package logger

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

type Level string

const (
	LevelDebug Level = "DEBUG"
	LevelInfo  Level = "INFO"
	LevelWarn  Level = "WARN"
	LevelError Level = "ERROR"
)

// LogEntry is the structured output format for server observability.
type LogEntry struct {
	Timestamp  string         `json:"timestamp"`
	Level      Level          `json:"level"`
	Message    string         `json:"message"`
	RequestID  string         `json:"requestId,omitempty"`
	UserID     string         `json:"userId,omitempty"`
	Endpoint   string         `json:"endpoint,omitempty"`
	Provider   string         `json:"provider,omitempty"`
	Mode       string         `json:"mode,omitempty"`
	UsageUnits int            `json:"usageUnits,omitempty"`
	DurationMs int64          `json:"durationMs,omitempty"`
	Status     string         `json:"status,omitempty"`
	Fields     map[string]any `json:"fields,omitempty"`
}

type Logger struct {
	mu        sync.Mutex
	out       io.Writer
	debugMode bool
}

var defaultLogger = &Logger{out: os.Stdout, debugMode: false}

func Init(debugMode bool) {
	defaultLogger.mu.Lock()
	defer defaultLogger.mu.Unlock()
	defaultLogger.debugMode = debugMode
}

func (l *Logger) log(level Level, msg string, entry *LogEntry) {
	if level == LevelDebug && !l.debugMode {
		return
	}

	if entry == nil {
		entry = &LogEntry{}
	}
	entry.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	entry.Level = level
	entry.Message = msg

	// Sanitize any sensitive keys that might accidentally be present in Fields
	if entry.Fields != nil {
		sanitized := make(map[string]any)
		for k, v := range entry.Fields {
			lower := strings.ToLower(k)
			if strings.Contains(lower, "password") || strings.Contains(lower, "token") || strings.Contains(lower, "auth") || strings.Contains(lower, "key") || strings.Contains(lower, "secret") {
				sanitized[k] = "[REDACTED]"
			} else {
				sanitized[k] = v
			}
		}
		entry.Fields = sanitized
	}

	data, err := json.Marshal(entry)
	if err != nil {
		fmt.Fprintf(os.Stderr, "logger json marshal error: %v\n", err)
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = l.out.Write(append(data, '\n'))
}

func Info(msg string, entry *LogEntry) {
	defaultLogger.log(LevelInfo, msg, entry)
}

func Warn(msg string, entry *LogEntry) {
	defaultLogger.log(LevelWarn, msg, entry)
}

func Error(msg string, entry *LogEntry) {
	defaultLogger.log(LevelError, msg, entry)
}

func Debug(msg string, entry *LogEntry) {
	defaultLogger.log(LevelDebug, msg, entry)
}
