/**
 * Errors that map directly to an HTTP status code. The Fastify error handler
 * reads `statusCode`, so throwing one of these from the parsing pipeline yields
 * the right response with no extra branching.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
  }
}

/** 415 — a real MPEG audio frame, but not MPEG-1 Layer III (out of scope). */
export class UnsupportedFormatError extends HttpError {
  constructor(message: string) {
    super(415, message);
  }
}

/** 422 — no decodable MPEG audio frame was found; not a valid MP3. */
export class InvalidMp3Error extends HttpError {
  constructor(message = 'No MPEG audio frames found; file is not a valid MP3.') {
    super(422, message);
  }
}
