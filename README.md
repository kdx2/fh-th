# MP3 Frame-Counting API

An HTTP API that accepts an `.mp3` file upload and returns the number of **MPEG-1 Audio
Layer III** frames it contains.

Endpoint (EP):<br>
`POST /file-upload`

Response:

```json
{ "frameCount": "<number>" }
```

> **Status:** 200

## Requirements

- Node.js ≥ 20
- npm

## Getting started

To run on local without containerization*:

```bash
npm install
npm run dev        # start with hot reload (tsx) on http://localhost:3000
# or
npm run build && npm start
```
\* *for containerized runs, please find the Docker section below*

### Manual test uploads

The request must be a `multipart/form-data` POST with a single file part named
`file`. Only one request header matters:

- **`Content-Type: multipart/form-data; boundary=…`** — required. The `boundary`
  is what delimits the file part; without it the request is rejected with `406` (Not Acceptable).
- `Content-Length` (or chunked transfer).

Preferably, rely on the client to automatically **generate the header** - `Content-Type: multipart/form-data` - and **boundary**
as its manual calculation or lack of boundary may lead to an error like 406.

#### Using curl

`-F` makes curl set `Content-Type: multipart/form-data` (with boundary) and
`Content-Length` for you:

```bash
curl -F "file=@assets/sample.mp3" http://localhost:3000/file-upload
```

Expected response format:

```json
  {
     "frameCount": <number>
  }
```

#### Insomnia

1. Create a new **POST** request to `http://localhost:3000/file-upload`.
2. **Body → Multipart Form**.
3. Add a field, set its name to `file`, switch its type to **File**, and choose
   `assets/sample.mp3`.
4. Leave the **Headers** tab empty — Insomnia sets
   `Content-Type: multipart/form-data` with the boundary automatically. (Do not
   add it by hand, or the boundary will be missing.)
5. **Send**.

#### Postman

1. New **POST** request to `http://localhost:3000/file-upload`.
2. **Body → form-data**.
3. Add a key named `file`, hover the key and switch its type from _Text_ to
   **File**, then select `assets/sample.mp3` under _Value_.
4. Don't add a `Content-Type` header in the **Headers** tab — Postman generates
   `multipart/form-data` with the boundary for you. (If a stale
   `Content-Type` header is present, remove it.)
5. **Send**.

## Docker

Multi-stage build producing a small, non-root production image:

```bash
npm run docker:build   # docker build -t mp3-frame-counter .
npm run docker:run     # docker run --rm -p 3000:3000 mp3-frame-counter
# then, against the container:
curl -F "file=@assets/sample.mp3" http://localhost:3000/file-upload
```

- **Multi-stage** — TypeScript is compiled in a build stage; the runtime image
  ships only `dist/` + production `node_modules`.
- Runs as the unprivileged **`node`** user.
- A **`HEALTHCHECK`** polls `/health` so Docker/orchestrators can track liveness.
- Configurable via env, e.g. `docker run -e PORT=8080 -e MAX_UPLOAD_BYTES=5242880 …`.

## Scripts

| Script                                | Description                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run ci`                          | **Full pipeline:** format-check → lint → typecheck → test → Docker image (fail-fast). |
| `npm run check`                       | Same gate without Docker: format-check → lint → typecheck → test.                     |
| `npm run dev`                         | Run in watch mode with `tsx`.                                                         |
| `npm run build`                       | Type-check and compile to `dist/`.                                                    |
| `npm start`                           | Run the compiled server from `dist/`.                                                 |
| `npm test`                            | Run the test suite (Vitest).                                                          |
| `npm run typecheck`                   | Type-check only (no emit).                                                            |
| `npm run lint`                        | Lint with ESLint.                                                                     |
| `npm run format`                      | Format with Prettier.                                                                 |
| `npm run docker:build` / `docker:run` | Build / run the production image.                                                     |

## API

### `POST /file-upload`

`multipart/form-data` with a single file field named `file`.

| Status | When                                                                  |
| ------ | --------------------------------------------------------------------- |
| `200`  | Parsed successfully — body `{ "frameCount": <number> }`.              |
| `400`  | No file provided in the `file` field.                                 |
| `406`  | Request was not `multipart/form-data`.                                |
| `413`  | Upload exceeded `MAX_UPLOAD_BYTES`.                                   |
| `415`  | A real MPEG frame, but not MPEG-1 Layer III (e.g. MPEG-2 / Layer II). |
| `422`  | No MPEG audio frame found — file is not a valid MP3.                  |
| `500`  | Unexpected server error.                                              |

### `GET /health`

Liveness/readiness probe → `200 { "status": "ok" }`. Kept out of the request logs
and used by the container `HEALTHCHECK`.

## Testing

```bash
npm test            # run the whole suite once (Vitest)
npm run test:watch  # watch mode
```

Two layers:

- **Unit tests** (`test/mp3/`) exercise the parser in isolation with synthetic,
  hand-built MPEG-1 Layer III frames and the real `assets/sample.mp3`: header
  decoding, frame-length maths, ID3v2 tag skipping (including across chunk
  boundaries), next-sync confirmation, and the streaming frame count.
- **Endpoint tests** (`test/server/fileUpload.test.ts`) drive the real Fastify app
  in-process via `app.inject()` (no socket/port needed) and assert **every**
  response code the API can return:

  | Code  | Scenario                                         |
  | ----- | ------------------------------------------------ |
  | `200` | valid MPEG-1 Layer III upload → `{ frameCount }` |
  | `400` | multipart with no `file` field                   |
  | `406` | request is not `multipart/form-data`             |
  | `413` | upload exceeds the size limit                    |
  | `415` | a real MPEG frame that isn't MPEG-1 Layer III    |
  | `422` | bytes contain no MPEG frame                      |
  | `404` | unknown route                                    |
  | `500` | an unexpected error maps to a JSON 500           |

## Architecture

The upload is parsed **inline as it streams**, which keeps memory flat and the
event loop free:

```
client ──(multipart stream)──▶ Fastify route ──(for await chunk)──▶ Mp3FrameCounter.consume()
                                                                          │ .finalise()
                              { frameCount } ◀───────────────────────────┘
```

- **Streaming upload** — `@fastify/multipart` exposes the file as a `Readable`.
  No temp files; bytes flow through in chunks at constant memory.
- **Incremental parse** (`src/mp3/countFramesInStream.ts`) — each chunk is fed to a
  per-request `Mp3FrameCounter`. Because work is O(chunk) per call and the loop
  interleaves other requests between chunks, a large file never blocks the loop,
  and a fresh counter per request keeps each response tied to its own bytes.
- **The parser** (`src/mp3/frameCounter.ts`) is a pure `consume(chunk)` / `finalise()`
  state machine that only sees raw bytes — no HTTP, no filesystem.

### Layout

```
src/
  config.ts                  # env-driven config (port, host, size limit)
  index.ts                   # bootstrap + graceful shutdown
  server/
    app.ts                   # buildApp(): Fastify + multipart + error handler
    routes/fileUpload.ts     # POST /file-upload
  mp3/
    countFramesInStream.ts   # consume a Readable -> frame count (entry point)
    streamParser.ts          # Mp3StreamParser: carry + leading ID3v2 skip
    frameCounter.ts          # Mp3FrameCounter: count frames
    formatValidator.ts       # Mp3FormatValidator: reject non-MPEG-1 Layer III
    frameHeader.ts           # header decode, frame length, ID3v2 tag, format checks
    errors.ts                # HttpError + 415/422
test/mp3/                    # parser unit tests (mirror src/mp3)
test/server/                 # endpoint integration tests (app.inject)
assets/sample.mp3            # provided sample (MPEG-1 L3, VBR, mediainfo: 6089 frames)
```

## Configuration

| Variable           | Default              | Description                   |
| ------------------ | -------------------- | ----------------------------- |
| `PORT`             | `3000`               | HTTP port.                    |
| `HOST`             | `0.0.0.0`            | Bind address.                 |
| `MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Max upload size before `413`. |
