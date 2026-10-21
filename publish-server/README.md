# Localist publish, version 3

A standalone Go server for anonymous, token-owned public JSON documents. Standard library only.
Localist integration is separate. Versions 1 and 2 and their data are not modified or migrated.

## Build and test

Use a supported Go release, at least Go 1.22. Run from this directory:

```sh
go build -o publish .
go test -race ./...
```

The optional token helper uses standard Web Crypto, without handwritten hashing or packages.
Its command-line mode requires Node 24.2 or newer:

```sh
node --test token.test.mjs
node token.mjs generate
node token.mjs check "$TOKEN"
node token.mjs id "$TOKEN"
```

`generate` prints a fresh token. With no arguments, the helper also generates a token.
`check` prints `valid` or `invalid`, exiting with status 1 for an invalid token.
It checks the token format and checksum, not whether the server has registered the token.
`id` prints the public ID, rejecting invalid tokens. Missing, extra, or unknown arguments exit 1.
Avoid pasting real tokens into shell history; command-line arguments can also appear in process lists.

`token.mjs` also exports `generateToken()`, `isValidToken(token)`, and `publicId(token)` for browsers.
Browser hashing requires a secure context, normally HTTPS or localhost.

## Run

```sh
./publish -host 127.0.0.1 -port 8080 -data ./data
```

Flags override environment variables. Defaults:

| Environment | Flag | Default |
| --- | --- | --- |
| `HOST` | `-host` | `127.0.0.1` |
| `PORT` | `-port` | `8080` |
| `DATA_DIR` | `-data` | `./data` |
| `MODE` | `-mode` | `open` |
| `MAX_BYTES` | `-max-bytes` | 1,048,576 bytes per document |
| `MAX_TOTAL_BYTES` | `-max-total-bytes` | 268,435,456 committed document bytes |
| `MAX_DOCUMENTS` | `-max-documents` | 1,000 documents |
| `CREATES_PER_MINUTE` | `-creates-per-minute` | 30 authenticated POST attempts, globally |

`open` keeps the current behavior: new tokens can create documents, and existing owners can update.
`closed` returns 403 for authenticated `POST /documents` requests. Existing owners can still update
using PUT, and public reads are unchanged. A token is existing only if its document is already in
`DATA_DIR`; generating a token without publishing does not register it. Other mode values stop startup.

To close registration, restart with the same data directory:

```sh
./publish -mode closed -data ./data
```

Use `MODE=closed` instead of the flag if preferred. Restart with `-mode open` to allow new publishers.

Limits must be positive. A full store returns 507; the creation rate limit returns 429.
The global creation limit does not block updates. It resets after one minute or a server restart.
Use your reverse proxy for per-IP request limits; the server does not trust forwarded IP headers.
These bounds limit resource use, not abuse entirely. Anyone can consume the available capacity.

Run exactly one server process per data directory. Use a separate directory for this version.
Documents are raw JSON files named by their full 64-character ownership hash. Tokens are not stored.
Writes use a private temporary file, file sync, and atomic rename. Quotas are checked under a lock
and reconstructed from existing documents on restart. Invalid stored JSON stops startup unchanged.
The byte quota covers committed documents, not filesystem overhead or temporary writes. Leave free
space for one extra maximum-sized document. There is no history or power-loss durability guarantee.
Do not edit files inside the data directory while the server runs.

## Token protocol

Generate a token once, keep it private, and reuse it on saves. Losing it loses write access.
Changing it creates a different document URL. It must never appear in public HTML, JSON, or URLs.

Format: `lp1_` + 32 base64url characters + 8 checksum characters, 44 characters total.
The random part encodes 24 cryptographically random bytes, giving 192 bits of randomness.
The checksum is the first six bytes of SHA-256 over
`"localist-publish:token:v1:" + randomPart`, encoded as unpadded base64url.
The public document ID is the full lowercase hexadecimal SHA-256 of the entire token.
The checksum detects mistakes and separates protocol versions. It does not prove Tauri generated
the token. Anyone can implement this format; authentication is possession of the secret token.
Old prototype tokens are deliberately unsupported. There is no automatic migration.

## Publish and read

In your publishing terminal, generate and retain your secret token:

```sh
TOKEN="$(node token.mjs)"
```

Do not rerun that command for every save. Store the secret securely for reuse after restarts.
The following inline JSON is a public example, not a Localist index:

```sh
curl --fail-with-body --request POST http://127.0.0.1:8080/documents \
  --header "Authorization: Bearer ${TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"projects":[{"name":"My project","description":"Public description"}]}'
```

Creation returns 201 with `{"id":"...","url":"/documents/..."}` and a Location header.
In open mode, POST with an existing token returns 409.
Replace your document without needing to retain its ID:

```sh
curl --fail-with-body --request PUT http://127.0.0.1:8080/documents \
  --header "Authorization: Bearer ${TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"projects":[{"name":"Updated project"}]}'
```

| Request | Authentication | Result |
| --- | --- | --- |
| `POST /documents` | Bearer | Create once, open mode only |
| `GET /documents` | Bearer | Read your document; Location gives its public URL |
| `PUT /documents` | Bearer | Replace your document |
| `GET /documents/{id}` | None | Read original JSON, without a metadata wrapper |
| `PUT /documents/{id}` | Owning bearer | Replace that document |
| `GET /healthz` | None | Health check |

GET endpoints also support HEAD. OPTIONS handles browser preflight. Public reads allow CORS,
responses use `Cache-Control: no-store`, and errors never echo tokens or uploaded content.
Missing/invalid credentials return 401; another owner's token returns 403. Invalid JSON returns
400, non-JSON content type 415, and oversized documents 413. Updates replace the entire document.

**Everything uploaded is public.** The server accepts arbitrary UTF-8 JSON, not the Localist schema.
The future Localist integration must filter private projects and omit local paths before upload.
Never upload the complete private index and rely on the public viewer to hide fields.

## HTTPS on a VPS

Keep the loopback bind, run as an unprivileged user, and put TLS in front of the server:

```caddyfile
publish.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Public URLs then use `https://publish.example.com/documents/{id}`. Do not send tokens over public
plain HTTP or expose port 8080 unnecessarily. Go enforces header, body-read, response-write, and
idle deadlines. Use your existing process manager to keep the binary running and back up its data.
