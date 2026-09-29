/* Minimal structured logger. Silent during tests to keep output readable. */
const silent = process.env.NODE_ENV === 'test';

function format(level: string, message: string, meta?: unknown): string {
  const time = new Date().toISOString();
  const suffix = meta === undefined ? '' : ` ${meta instanceof Error ? (meta.stack ?? meta.message) : JSON.stringify(meta)}`;
  return `${time} [${level}] ${message}${suffix}`;
}

export const logger = {
  info(message: string, meta?: unknown) {
    if (!silent) console.log(format('info', message, meta));
  },
  warn(message: string, meta?: unknown) {
    if (!silent) console.warn(format('warn', message, meta));
  },
  error(message: string, meta?: unknown) {
    if (!silent) console.error(format('error', message, meta));
  },
};
