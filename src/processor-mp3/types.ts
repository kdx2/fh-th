/**
 * Incremental, streaming frame counter.
 *
 * Contract:
 *  - `update()` - called with each chunk of file bytes, in order. Frames may be
 *    split across chunk boundaries, so implementations must carry state between
 *    calls.
 *  - `finalise()` - called exactly once, after the last chunk. Returns the total
 *    number of frames counted.
 *
 * The implementation only ever sees raw bytes — no HTTP or Fastify types — which
 * keeps it pure and easy to unit-test in isolation.
 */
export interface FrameParser {
  update(chunk: Buffer): void;
  finalise(): number;
}
