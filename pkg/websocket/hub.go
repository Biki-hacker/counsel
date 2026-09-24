package websocket

import (
	"context"
	"sync"

	"counsel/pkg/logger"

	"github.com/gorilla/websocket"
)

// ActiveStream tracks an ongoing streaming inference for instant cancellation.
type ActiveStream struct {
	Cancel context.CancelFunc
}

// Hub tracks connected WebSocket clients and active streaming jobs.
type Hub struct {
	mu            sync.RWMutex
	connections   map[*websocket.Conn]string        // conn -> userId
	activeStreams map[string]map[string]context.CancelFunc // userId -> (conversationId -> cancelFunc)
}

func NewHub() *Hub {
	return &Hub{
		connections:   make(map[*websocket.Conn]string),
		activeStreams: make(map[string]map[string]context.CancelFunc),
	}
}

func (h *Hub) Register(conn *websocket.Conn, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.connections[conn] = userID
	if _, ok := h.activeStreams[userID]; !ok {
		h.activeStreams[userID] = make(map[string]context.CancelFunc)
	}
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	userID, ok := h.connections[conn]
	if ok {
		delete(h.connections, conn)

		// Check if the user has any other active WebSocket connections
		hasOtherConns := false
		for _, uID := range h.connections {
			if uID == userID {
				hasOtherConns = true
				break
			}
		}

		if !hasOtherConns {
			if streams, found := h.activeStreams[userID]; found {
				for _, cancel := range streams {
					cancel()
				}
				delete(h.activeStreams, userID)
			}
		}
	}
	_ = conn.Close()
}

func (h *Hub) TrackStream(userID, conversationID string, cancel context.CancelFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.activeStreams[userID]; !ok {
		h.activeStreams[userID] = make(map[string]context.CancelFunc)
	}
	h.activeStreams[userID][conversationID] = cancel
}

func (h *Hub) CancelStream(userID, conversationID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	if streams, ok := h.activeStreams[userID]; ok {
		if cancel, found := streams[conversationID]; found {
			cancel()
			delete(streams, conversationID)
			logger.Info("Active stream cancelled", &logger.LogEntry{
				UserID:   userID,
				Endpoint: "/ws/chat",
			})
			return true
		}
	}
	return false
}

func (h *Hub) ClearStream(userID, conversationID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if streams, ok := h.activeStreams[userID]; ok {
		delete(streams, conversationID)
	}
}
