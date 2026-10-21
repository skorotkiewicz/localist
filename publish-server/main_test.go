package main

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// Shared with token.test.mjs; random bytes are 0 through 23, not a real secret.
const fixtureToken = "lp1_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX5VZh-f0u"
const fixtureID = "65f46d9a54c22933cb19564aceaa914d7bba4bcb16d4a9360e3ad6063a39446e"

func anotherToken() string {
	random := strings.Repeat("B", 32)
	sum := sha256.Sum256([]byte(checksumContext + random))
	return "lp1_" + random + base64.RawURLEncoding.EncodeToString(sum[:6])
}

func testServer(t *testing.T) *server {
	t.Helper()
	store, err := openStore(t.TempDir(), 128, 512, 4)
	if err != nil {
		t.Fatal(err)
	}
	return &server{store: store, createLimit: 100}
}

func request(s *server, method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	s.handler().ServeHTTP(w, r)
	return w
}

func TestTokenProtocol(t *testing.T) {
	if !validToken(fixtureToken) || publicID(fixtureToken) != fixtureID {
		t.Fatal("token protocol disagrees with the shared JS fixture")
	}
	for _, token := range []string{"", fixtureToken + "x", fixtureToken[:43], "bt_" + strings.Repeat("A", 32), strings.Replace(fixtureToken, "lp1_", "lp2_", 1), fixtureToken[:43] + "A"} {
		if validToken(token) {
			t.Fatalf("accepted invalid fixture %q", token)
		}
	}
}

func TestPublishReadUpdateAndRestart(t *testing.T) {
	s := testServer(t)
	url := "/documents/" + fixtureID
	payload := "{\"projects\":[{\"name\":\"Żółw 🦀\"}]}\n"
	if got := request(s, "POST", "/documents", fixtureToken, payload); got.Code != 201 || got.Header().Get("Location") != url {
		t.Fatalf("create: %d %s", got.Code, got.Body)
	}
	if got := request(s, "POST", "/documents", fixtureToken, "{}"); got.Code != 409 {
		t.Fatalf("duplicate create: %d", got.Code)
	}
	for _, path := range []string{url, "/documents"} {
		token := ""
		if path == "/documents" {
			token = fixtureToken
		}
		got := request(s, "GET", path, token, "")
		if got.Code != 200 || got.Body.String() != payload {
			t.Fatalf("read %s: %d %s", path, got.Code, got.Body)
		}
		if got.Header().Get("Cache-Control") != "no-store" || got.Header().Get("X-Content-Type-Options") != "nosniff" || got.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Fatal("missing public response protection headers")
		}
	}
	if got := request(s, "HEAD", url, "", ""); got.Code != 200 || got.Body.Len() != 0 {
		t.Fatalf("HEAD: %d %s", got.Code, got.Body)
	}
	for _, path := range []string{url, "/documents"} {
		if got := request(s, "PUT", path, fixtureToken, `{"updated":true}`); got.Code != 200 {
			t.Fatalf("update: %d %s", got.Code, got.Body)
		}
	}
	reopened, err := openStore(s.store.dir, 128, 512, 4)
	if err != nil {
		t.Fatal(err)
	}
	restarted := &server{store: reopened, createLimit: 100}
	if got := request(restarted, "GET", url, "", ""); got.Body.String() != `{"updated":true}` {
		t.Fatal("document did not survive reopening the store")
	}
}

func TestClosedMode(t *testing.T) {
	s := testServer(t)
	s.closed = true
	if got := request(s, "POST", "/documents", fixtureToken, "{}"); got.Code != 403 || s.store.count != 0 {
		t.Fatalf("closed empty server accepted a new publisher: %d %s", got.Code, got.Body)
	}
	s.closed = false
	if got := request(s, "POST", "/documents", fixtureToken, `{"original":true}`); got.Code != 201 {
		t.Fatalf("open server rejected a new publisher: %d %s", got.Code, got.Body)
	}
	reopened, err := openStore(s.store.dir, 128, 512, 4)
	if err != nil {
		t.Fatal(err)
	}
	s = &server{store: reopened, closed: true, createLimit: 1, attempts: 1, window: time.Now()}
	other := anotherToken()
	cases := []struct {
		method, path, token string
		status              int
	}{
		{"POST", "/documents", other, 403},
		{"POST", "/documents", fixtureToken, 403},
		{"POST", "/documents", "", 401},
		{"PUT", "/documents", other, 404},
		{"PUT", "/documents/" + publicID(other), other, 404},
		{"PUT", "/documents/" + fixtureID, other, 403},
	}
	for _, tc := range cases {
		if got := request(s, tc.method, tc.path, tc.token, "{}"); got.Code != tc.status {
			t.Fatalf("%s %s: expected %d, got %d: %s", tc.method, tc.path, tc.status, got.Code, got.Body)
		}
	}
	if s.store.count != 1 || s.attempts != 1 {
		t.Fatal("closed mode created a document or consumed the creation rate limit")
	}
	url := "/documents/" + fixtureID
	if got := request(s, "GET", url, "", ""); got.Code != 200 || got.Body.String() != `{"original":true}` {
		t.Fatal("closed mode blocked public reads or changed the existing document")
	}
	for _, path := range []string{"/documents", url} {
		if got := request(s, "PUT", path, fixtureToken, `{"updated":true}`); got.Code != 200 {
			t.Fatalf("closed mode rejected an existing owner's update: %d %s", got.Code, got.Body)
		}
	}
	if got := request(s, "GET", url, "", ""); got.Code != 200 || got.Body.String() != `{"updated":true}` {
		t.Fatal("existing owner's update was not published")
	}
}

func TestRejectedUpdatesKeepPreviousDocument(t *testing.T) {
	s := testServer(t)
	request(s, "POST", "/documents", fixtureToken, `{"original":true}`)
	url := "/documents/" + fixtureID
	cases := []struct {
		token, body string
		status      int
	}{
		{"", "{}", 401},
		{"invalid", "{}", 401},
		{anotherToken(), "{}", 403},
		{fixtureToken, "", 400},
		{fixtureToken, "{} garbage", 400},
		{fixtureToken, "\"\xff\"", 400},
		{fixtureToken, "{}" + strings.Repeat(" ", 126) + "garbage", 413},
	}
	for _, tc := range cases {
		if got := request(s, "PUT", url, tc.token, tc.body); got.Code != tc.status {
			t.Fatalf("expected %d, got %d: %s", tc.status, got.Code, got.Body)
		}
	}
	r := httptest.NewRequest("PUT", url, strings.NewReader("{}"))
	r.Header.Set("Authorization", "Bearer "+fixtureToken)
	r.Header.Set("Content-Type", "text/plain")
	w := httptest.NewRecorder()
	s.handler().ServeHTTP(w, r)
	if w.Code != 415 {
		t.Fatalf("wrong content type: %d", w.Code)
	}
	if got := request(s, "GET", url, "", ""); got.Body.String() != `{"original":true}` {
		t.Fatal("rejected update changed the published document")
	}
	for _, id := range []string{"../secret", strings.Repeat("a", 63), strings.Repeat("A", 64), "%2e%2e%2fsecret"} {
		if got := request(s, "GET", "/documents/"+id, "", ""); got.Code == 200 {
			t.Fatalf("invalid public ID accepted: %s", id)
		}
	}
	if got := request(s, "OPTIONS", url, "", ""); got.Code != 204 {
		t.Fatalf("CORS preflight: %d", got.Code)
	}
}

func TestStorageQuotasAndAccounting(t *testing.T) {
	s, err := openStore(t.TempDir(), 32, 10, 2)
	if err != nil {
		t.Fatal(err)
	}
	a, b, c := strings.Repeat("a", 64), strings.Repeat("b", 64), strings.Repeat("c", 64)
	if err := s.put(a, []byte("1234"), true); err != nil {
		t.Fatal(err)
	}
	if err := s.put(b, []byte("123456"), true); err != nil {
		t.Fatal(err)
	}
	if err := s.put(c, []byte("0"), true); !errors.Is(err, errCapacity) {
		t.Fatalf("document quota: %v", err)
	}
	if err := s.put(a, []byte("12345"), false); !errors.Is(err, errCapacity) {
		t.Fatalf("byte quota: %v", err)
	}
	if err := s.put(a, []byte("1"), false); err != nil {
		t.Fatal(err)
	}
	if err := s.put(b, []byte("123456789"), false); err != nil {
		t.Fatal(err)
	}
	reopened, err := openStore(s.dir, 32, 10, 2)
	if err != nil || reopened.total != 10 || reopened.count != 2 {
		t.Fatalf("quota recount: %+v %v", reopened, err)
	}
	if _, err := openStore(s.dir, 32, 9, 2); !errors.Is(err, errCapacity) {
		t.Fatalf("startup ignored the byte quota: %v", err)
	}
	limited, err := openStore(t.TempDir(), 32, 100, 1)
	if err != nil {
		t.Fatal(err)
	}
	if err := limited.put(a, []byte("0"), true); err != nil {
		t.Fatal(err)
	}
	if err := limited.put(b, []byte("0"), true); !errors.Is(err, errCapacity) {
		t.Fatalf("count quota: %v", err)
	}
}

func TestCreationRateLimit(t *testing.T) {
	s := testServer(t)
	s.createLimit = 1
	if got := request(s, "POST", "/documents", fixtureToken, "{}"); got.Code != 201 {
		t.Fatalf("first create: %d", got.Code)
	}
	if got := request(s, "POST", "/documents", anotherToken(), "{}"); got.Code != 429 || got.Header().Get("Retry-After") == "" {
		t.Fatalf("rate limit: %d", got.Code)
	}
	if got := request(s, "PUT", "/documents", fixtureToken, "{}"); got.Code != 200 {
		t.Fatal("creation limit blocked an existing publisher's update")
	}
	if !s.allowCreate(s.window.Add(time.Minute)) {
		t.Fatal("rate limit did not reset")
	}
}

func TestConcurrentCreateAndAtomicFailure(t *testing.T) {
	s := testServer(t)
	var wg sync.WaitGroup
	statuses := make(chan int, 16)
	for i := 0; i < cap(statuses); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses <- request(s, "POST", "/documents", fixtureToken, "{}").Code
		}()
	}
	wg.Wait()
	close(statuses)
	created := 0
	for status := range statuses {
		if status == 201 {
			created++
		} else if status != 409 {
			t.Fatalf("unexpected concurrent response: %d", status)
		}
	}
	if created != 1 || s.store.count != 1 {
		t.Fatal("concurrent creates bypassed uniqueness")
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "directory")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := atomicWrite(target, []byte("{}")); err == nil {
		t.Fatal("rename over a directory unexpectedly succeeded")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 || !entries[0].IsDir() {
		t.Fatal("failed write left temporary files or changed the target")
	}
}

func TestCorruptStoreRefused(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, fixtureID+".json")
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := openStore(dir, 128, 512, 4); err == nil {
		t.Fatal("accepted a corrupt document at startup")
	}
	body, _ := os.ReadFile(path)
	if string(body) != "{broken" {
		t.Fatal("startup changed the corrupt document")
	}
}
