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

```bash
npm install
npm run dev        # start with hot reload (tsx) on http://localhost:3000
# or
npm run build && npm start
```

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

## Scripts

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Run in watch mode with `tsx`.         |
| `npm run build`  | Type-check and compile to `dist/`.    |
| `npm start`      | Run the compiled server from `dist/`. |
| `npm test`       | Run the test suite (Vitest).          |
| `npm run lint`   | Lint with ESLint.                     |
| `npm run format` | Format with Prettier.                 |

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
| `500`  | Unexpected error (e.g. parser not implemented).                       |

## Architecture

The upload is parsed **inline as it streams**, which keeps memory flat and the
event loop free:

```
client ──(multipart stream)──▶ Fastify route ──(for await chunk)──▶ Mp3FrameCounter.update()
                                                                          │ .finalise()
                              { frameCount } ◀───────────────────────────┘
```

- **Streaming upload** — `@fastify/multipart` exposes the file as a `Readable`.
  No temp files; bytes flow through in chunks at constant memory.
- **Incremental parse** (`src/processor-mp3/countStream.ts`) — each chunk is fed to a
  per-request `Mp3FrameCounter`. Because work is O(chunk) per call and the loop
  interleaves other requests between chunks, a large file never blocks the loop,
  and a fresh counter per request keeps each response tied to its own bytes.
- **The parser** (`src/processor-mp3/frameCounter.ts`) is a pure `update(chunk)` / `finalise()`
  state machine that only sees raw bytes — no HTTP, no filesystem.

### Layout

```
src/
  config.ts                 # env-driven config (port, size limit)
  index.ts                  # bootstrap + graceful shutdown
  server/
    app.ts                  # buildApp(): Fastify + multipart + error handler
    routes/fileUpload.ts    # POST /file-upload
  processor-mp3/
    types.ts                # FrameParser interface
    countStream.ts          # consume a Readable -> frame count
    frameCounter.ts         # todo: the parser
test/                       # todo: add tests
assets/sample.mp3           # provided sample (MPEG-1 L3, VBR, mediainfo: 6089 frames)
docs/                       # algorithm + validation plans
```

## Configuration

| Variable           | Default              | Description                   |
| ------------------ | -------------------- | ----------------------------- |
| `PORT`             | `3000`               | HTTP port.                    |
| `HOST`             | `0.0.0.0`            | Bind address.                 |
| `MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Max upload size before `413`. |

## Notes & trade-offs

- **Why no worker threads.** Frame counting is I/O-bound, not CPU-bound — the
  parser only reads each frame's 4-byte header and skips the payload. Streaming
  already keeps the event loop responsive (O(chunk) per `update()`), so offloading
  to worker threads would add copy + messaging overhead while parallelising the
  trivial part. They'd only pay off if the per-file parse became genuinely
  CPU-heavy (decode/DSP).
- **Scaling for load.** The service is stateless (`buildApp()` factory, no shared
  state), so it scales horizontally — run multiple replicas behind a load
  balancer, or `node:cluster` across local cores. That is how an I/O-bound Node
  service uses multiple cores; worker threads would be the answer only if the
  per-file parse became genuinely CPU-heavy (decode/DSP).
- **VBR.** The sample is variable-bitrate, so the parser must read the bitrate
  from _each_ frame header rather than assuming a constant bitrate.
