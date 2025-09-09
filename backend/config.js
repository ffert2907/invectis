import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize, errors, splat } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

// Logger configuration
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info', // Default to 'info'
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // Log stack traces
    splat(),
    logFormat
  ),
  transports: [new transports.Console()],
});

// Add a 'prod' level for messages that should always be shown
logger.add(new transports.Console({
  level: 'prod',
  format: format.printf(info => info.message)
}));

// The secret pepper for HMAC operations.
// WARNING: In a production environment, this should be loaded from a secure
// source like a hardware security module (HSM) or a secret management service.
// It should NOT be hardcoded.
export const PEPPER = 'a-very-secret-pepper-that-is-not-so-secret';
