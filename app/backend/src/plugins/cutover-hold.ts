import type { FastifyPluginAsync } from 'fastify';
import { isCutoverHoldActive } from '../db/cutover-hold.js';

export interface CutoverHoldOptions {
  /** Injected by tests; production reads DATABASE_CUTOVER_HOLD through config. */
  isActive?: () => boolean;
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CUTOVER_HOLD_ERROR = {
  code: 'MAINTENANCE_HOLD',
  message: 'The booth is temporarily closed for maintenance. Please try again later.',
} as const;

const plugin: FastifyPluginAsync<CutoverHoldOptions> = async (fastify, options) => {
  // Evaluated once: the hold is released only by an operator restart with new config.
  if (!(options.isActive ?? isCutoverHoldActive)()) return;

  fastify.log.warn('Database cutover hold is active: mutation routes are disabled.');
  fastify.addHook('onRequest', async (request, reply) => {
    if (READ_ONLY_METHODS.has(request.method)) return;
    return reply
      .status(503)
      .header('retry-after', '300')
      .send({ success: false, error: CUTOVER_HOLD_ERROR });
  });
};

// Equivalent to fastify-plugin: the hook must also cover sibling route plugins.
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export const cutoverHoldPlugin = plugin;
