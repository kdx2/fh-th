import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import FormData from 'form-data';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';

/** 4-byte MPEG audio header (64 kbps, 44.1 kHz, no padding → 208-byte frames). */
function header(version: number, layer: number): Buffer {
  const b1 = 0xe0 | (version << 3) | (layer << 1) | 1;
  const b2 = (5 << 4) | (0 << 2);
  return Buffer.from([0xff, b1, b2, 0x00]);
}

/** A complete 208-byte MPEG-1 Layer III frame (header + zeroed body). */
function fullFrame(version = 0b11, layer = 0b01): Buffer {
  const frame = Buffer.alloc(208);
  header(version, layer).copy(frame, 0);
  return frame;
}

/** Two back-to-back frames — confirmable by next-sync, counts as 2. */
const TWO_FRAMES = Buffer.concat([fullFrame(), fullFrame()]);

/** POST `content` as the `file` part to /file-upload, in-process via inject. */
function uploadFile(app: FastifyInstance, content: Buffer) {
  const form = new FormData();
  form.append('file', content, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
  return app.inject({
    method: 'POST',
    url: '/file-upload',
    headers: form.getHeaders(),
    payload: form.getBuffer(),
  });
}

describe('POST /file-upload — response codes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    // Test-only route to exercise the global error handler's 500 fallback.
    app.get('/__boom', () => {
      throw new Error('boom');
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 — GET /health reports ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('200 — valid MPEG-1 Layer III frames returns the count', async () => {
    const res = await uploadFile(app, TWO_FRAMES);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ frameCount: 2 });
  });

  it('400 — multipart upload with no file field', async () => {
    const form = new FormData();
    form.append('notafile', 'just text');
    const res = await app.inject({
      method: 'POST',
      url: '/file-upload',
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTypeOf('string');
  });

  it('406 — request is not multipart/form-data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/file-upload',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ not: 'multipart' }),
    });
    expect(res.statusCode).toBe(406);
  });

  it('413 — upload exceeds the configured size limit', async () => {
    const smallApp = await buildApp({ logger: false, maxUploadBytes: 100 });
    try {
      const res = await uploadFile(smallApp, TWO_FRAMES); // 416 bytes > 100
      expect(res.statusCode).toBe(413);
    } finally {
      await smallApp.close();
    }
  });

  it('415 — a real MPEG frame, but not MPEG-1 Layer III', async () => {
    const res = await uploadFile(app, header(0b10, 0b01)); // MPEG-2 Layer III
    expect(res.statusCode).toBe(415);
    expect(res.json().error).toContain('MPEG Version 2');
  });

  it('422 — bytes contain no MPEG frame', async () => {
    const res = await uploadFile(app, Buffer.from('this is plainly not an mp3'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBeTypeOf('string');
  });

  it('404 — unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('500 — an unexpected error maps to a JSON 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/__boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'boom' });
  });
});
