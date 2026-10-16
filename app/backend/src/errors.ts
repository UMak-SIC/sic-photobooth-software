import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * An error whose message was written for booth guests and operators. Only these
 * messages may reach a client; anything else (database, driver, filesystem, or
 * library text) is logged and replaced with {@link INTERNAL_ERROR}.
 */
export class UserFacingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export const INTERNAL_ERROR = {
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong. Please try again or ask the booth operator for help.',
} as const;

/**
 * Sends the client-safe form of `err` and logs the full error with context:
 * a {@link UserFacingError} as a warning with its own status, code, and message;
 * anything else as an error with a 500 carrying `fallback` (an authored message).
 */
export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  context: string,
  fields: Record<string, unknown> = {},
  fallback: { code: string; message: string } = INTERNAL_ERROR,
): FastifyReply {
  const logFields = { err, route: request.routeOptions?.url, ...fields };
  if (err instanceof UserFacingError) {
    request.log.warn(logFields, context);
    return reply
      .status(err.statusCode)
      .send({ success: false, error: { code: err.code, message: err.message } });
  }
  request.log.error(logFields, context);
  return reply.status(500).send({ success: false, error: fallback });
}
