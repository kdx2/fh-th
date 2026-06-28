import type { Readable } from 'node:stream';
import { Mp3FrameCounter } from './frameCounter.js';
import { Mp3FormatValidator } from './formatValidator.js';

/**
 * Count MPEG-1 Audio Layer III frames in a byte stream.
 *
 * The stream is consumed one chunk at a time and validated for this format only.
 */
export async function countFramesInStream(stream: Readable): Promise<number> {
  const validator = new Mp3FormatValidator();
  const counter = new Mp3FrameCounter();

  for await (const rawChunk of stream) {
    const chunk = rawChunk as Buffer;
    validator.consume(chunk);
    counter.consume(chunk);
  }

  validator.finalise();
  return counter.finalise();
}
