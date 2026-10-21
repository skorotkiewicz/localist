// Command publish serves public JSON documents owned by client-generated bearer tokens.
package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

const checksumContext = "localist-publish:token:v1:"

var (
	tokenFormat = regexp.MustCompile(`^lp1_[A-Za-z0-9_-]{40}$`)
	idFormat    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	errExists   = errors.New("document already exists; use PUT to update")
	errCapacity = errors.New("storage capacity reached")
	errTooLarge = errors.New("document exceeds the size limit")
)

func validToken(token string) bool {
	if !tokenFormat.MatchString(token) {
		return false
	}
	sum := sha256.Sum256([]byte(checksumContext + token[4:36]))
	want := base64.RawURLEncoding.EncodeToString(sum[:6])
	return subtle.ConstantTimeCompare([]byte(want), []byte(token[36:])) == 1
}

func publicID(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func validJSON(body []byte) bool { return utf8.Valid(body) && json.Valid(body) }

// shortcut: one process owns DATA_DIR; add an interprocess lock before sharing it between instances.
type store struct {
	mu                               sync.RWMutex
	dir                              string
	maxBytes, maxTotal, maxDocuments int64
	total, count                     int64
}

func openStore(dir string, maxBytes, maxTotal, maxDocuments int64) (*store, error) {
	if maxBytes < 1 || maxTotal < 1 || maxDocuments < 1 {
		return nil, errors.New("storage limits must be positive")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &store{dir: dir, maxBytes: maxBytes, maxTotal: maxTotal, maxDocuments: maxDocuments}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") || !idFormat.MatchString(strings.TrimSuffix(entry.Name(), ".json")) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() || info.Size() > maxBytes {
			return nil, fmt.Errorf("invalid stored document %s", entry.Name())
		}
		body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		if !validJSON(body) {
			return nil, fmt.Errorf("invalid stored JSON %s; refusing to overwrite it", entry.Name())
		}
		if info.Size() > maxTotal-s.total || s.count >= maxDocuments {
			return nil, errCapacity
		}
		s.total += info.Size()
		s.count++
	}
	return s, nil
}

func (s *store) path(id string) string { return filepath.Join(s.dir, id+".json") }

func (s *store) get(id string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return os.ReadFile(s.path(id))
}

func atomicWrite(path string, body []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(body); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func (s *store) put(id string, body []byte, create bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if int64(len(body)) > s.maxBytes {
		return errTooLarge
	}
	info, err := os.Stat(s.path(id))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	exists := err == nil
	if create && exists {
		return errExists
	}
	if !create && !exists {
		return os.ErrNotExist
	}
	var oldSize int64
	if exists {
		if !info.Mode().IsRegular() {
			return errors.New("document is not a regular file")
		}
		oldSize = info.Size()
	}
	delta := int64(len(body)) - oldSize
	if (!exists && s.count >= s.maxDocuments) || delta > s.maxTotal-s.total {
		return errCapacity
	}
	if err := atomicWrite(s.path(id), body); err != nil {
		return err
	}
	s.total += delta
	if !exists {
		s.count++
	}
	return nil
}

type server struct {
	store       *store
	rateMu      sync.Mutex
	window      time.Time
	attempts    int64
	createLimit int64
}

func (s *server) allowCreate(now time.Time) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	if s.window.IsZero() || now.Sub(s.window) >= time.Minute {
		s.window, s.attempts = now, 0
	}
	if s.attempts >= s.createLimit {
		return false
	}
	s.attempts++
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func ownerID(w http.ResponseWriter, r *http.Request) (string, bool) {
	parts := strings.Fields(r.Header.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || !validToken(parts[1]) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		fail(w, http.StatusUnauthorized, "missing or invalid bearer token")
		return "", false
	}
	return publicID(parts[1]), true
}

func (s *server) readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		fail(w, http.StatusUnsupportedMediaType, "use Content-Type: application/json")
		return nil, false
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, s.store.maxBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			fail(w, http.StatusRequestEntityTooLarge, errTooLarge.Error())
		} else {
			fail(w, http.StatusBadRequest, "could not read request body")
		}
		return nil, false
	}
	if !validJSON(body) {
		fail(w, http.StatusBadRequest, "body must be non-empty UTF-8 JSON")
		return nil, false
	}
	return body, true
}

func (s *server) read(w http.ResponseWriter, r *http.Request, id string) {
	body, err := s.store.get(id)
	if err != nil {
		storageError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.Header().Set("Location", "/documents/"+id)
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func storageError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errExists):
		fail(w, http.StatusConflict, err.Error())
	case errors.Is(err, os.ErrNotExist):
		fail(w, http.StatusNotFound, "document not found")
	case errors.Is(err, errCapacity):
		fail(w, http.StatusInsufficientStorage, err.Error())
	case errors.Is(err, errTooLarge):
		fail(w, http.StatusRequestEntityTooLarge, err.Error())
	default:
		log.Printf("storage error: %v", err)
		fail(w, http.StatusInternalServerError, "storage error")
	}
}

func (s *server) write(w http.ResponseWriter, r *http.Request, id string, create bool) {
	body, ok := s.readBody(w, r)
	if !ok {
		return
	}
	if err := s.store.put(id, body, create); err != nil {
		storageError(w, err)
		return
	}
	status := http.StatusOK
	if create {
		status = http.StatusCreated
	}
	url := "/documents/" + id
	w.Header().Set("Location", url)
	writeJSON(w, status, map[string]string{"id": id, "url": url})
}

func (s *server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/documents", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodPost && r.Method != http.MethodPut {
			w.Header().Set("Allow", "GET, HEAD, POST, PUT, OPTIONS")
			fail(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		id, ok := ownerID(w, r)
		if !ok {
			return
		}
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			s.read(w, r, id)
			return
		}
		create := r.Method == http.MethodPost
		if create && !s.allowCreate(time.Now()) {
			w.Header().Set("Retry-After", "60")
			fail(w, http.StatusTooManyRequests, "creation rate limit reached; retry later")
			return
		}
		s.write(w, r, id, create)
	})
	mux.HandleFunc("/documents/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !idFormat.MatchString(id) {
			fail(w, http.StatusNotFound, "document not found")
			return
		}
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			s.read(w, r, id)
		case http.MethodPut:
			owner, ok := ownerID(w, r)
			if !ok {
				return
			}
			if subtle.ConstantTimeCompare([]byte(owner), []byte(id)) != 1 {
				fail(w, http.StatusForbidden, "token does not own this document")
				return
			}
			s.write(w, r, id, false)
		default:
			w.Header().Set("Allow", "GET, HEAD, PUT, OPTIONS")
			fail(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Expose-Headers", "Location")
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func positive(name, value string) int64 {
	n, err := strconv.ParseInt(value, 10, 64)
	if err != nil || n < 1 {
		log.Fatalf("%s must be a positive integer", name)
	}
	return n
}

func main() {
	host := flag.String("host", envOr("HOST", "127.0.0.1"), "bind address")
	port := flag.String("port", envOr("PORT", "8080"), "TCP port")
	dir := flag.String("data", envOr("DATA_DIR", "./data"), "data directory, owned by one server process")
	maxBytes := flag.String("max-bytes", envOr("MAX_BYTES", "1048576"), "maximum document bytes")
	maxTotal := flag.String("max-total-bytes", envOr("MAX_TOTAL_BYTES", "268435456"), "maximum committed document bytes")
	maxDocs := flag.String("max-documents", envOr("MAX_DOCUMENTS", "1000"), "maximum document count")
	creates := flag.String("creates-per-minute", envOr("CREATES_PER_MINUTE", "30"), "global POST attempt limit per minute")
	flag.Parse()
	if *host == "" || positive("PORT", *port) > 65535 {
		log.Fatal("invalid host or port")
	}
	store, err := openStore(*dir, positive("MAX_BYTES", *maxBytes), positive("MAX_TOTAL_BYTES", *maxTotal), positive("MAX_DOCUMENTS", *maxDocs))
	if err != nil {
		log.Fatal(err)
	}
	app := &server{store: store, createLimit: positive("CREATES_PER_MINUTE", *creates)}
	srv := &http.Server{
		Addr: net.JoinHostPort(*host, *port), Handler: app.handler(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		deadline, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(deadline); err != nil {
			log.Printf("shutdown: %v", err)
			_ = srv.Close()
		}
	}()
	log.Printf("listening on http://%s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
