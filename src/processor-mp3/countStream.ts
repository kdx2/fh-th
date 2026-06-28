import type { Readable } from 'node:stream';
import { Mp3FrameCounter } from './frameCounter.js';
import { Mp3FormatValidator } from './formatValidator.js';

/**
 * Count MPEG-1 Audio Layer III frames in a byte stream.
 *
 * The stream is consumed one chunk at a time, thus:
 *  - memory stays flat (~one chunk) regardless of file size, and
 *  - the event loop is never blocked by a whole-file parse (each `update()` does
 *    O(chunk) work, and other requests interleave between chunks).
 *
 * Each chunk is also fed to a format guard that rejects non-MPEG-1-Layer-III
 * uploads early (throwing before the whole file is read). Fresh instances per
 * call guarantee the result reflects only this stream's bytes, even when many
 * uploads are processed concurrently.
 */
export async function countFramesInStream(stream: Readable): Promise<number> {
  const validator = new Mp3FormatValidator();
  const counter = new Mp3FrameCounter();

  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    validator.validate(buf); // throws 415 on an unsupported format
    counter.update(buf);
  }

  validator.finalise(); // throws 422 if no MPEG audio frame was found
  return counter.finalise();
}
