import { Context } from '../context';

export function finalizeKona(ctx: Context) {
  const log = ctx.log;

  log.stopStreaming();
  log.fuseFinalise();
}

// Backwards compatibility alias
export const finalizeFusebox = finalizeKona;
