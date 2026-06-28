/**
 * Incremental, streaming frame counter.
 *
 * Contract:
 *  - `consume()` - called with each chunk of file bytes, in order. Frames may be
 *    split across chunk boundaries, so implementations must carry state between
 *    calls.
 *  - `finalise()` - called exactly once, after the last chunk. Returns the total
 *    number of frames counted.
 *
 * The implementation only ever sees raw bytes — no HTTP or Fastify types — which
 * keeps it pure and easy to unit-test in isolation.
 */
export interface FrameParser {
  consume(chunk: Buffer): void;
  finalise(): number;
}
