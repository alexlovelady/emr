import pino, { type Logger } from 'pino';

export interface LoggerConfig {
  level: string;
  serviceName: string;
}

/**
 * Redaction list is deliberately broad — spec rule #10: "No production data in ... non-BAA
 * tooling" and "no PHI in analytics/telemetry by default." Add paths here before logging any new
 * object shape that might carry a secret or PHI-adjacent value; do not rely on call sites to
 * remember to scrub.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
];

export function createLogger(config: LoggerConfig): Logger {
  return pino({
    level: config.level,
    base: { service: config.serviceName },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  });
}
