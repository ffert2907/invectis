import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize, errors, splat } = format;

// Define custom levels to include 'prod'
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    prod: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  },
  colors: {
    prod: 'green'
  }
};

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

// Logger configuration
export const logger = createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'silly', // Log all levels by default
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // Log stack traces
    splat(),
    logFormat
  ),
  transports: [new transports.Console()],
});

// Add colors for the custom levels
format.colorize().addColors(customLevels.colors);


// The secret pepper for HMAC operations.
// WARNING: In a production environment, this should be loaded from a secure
// source like a hardware security module (HSM) or a secret management service.
// It should NOT be hardcoded.
export const PEPPER = 'a-very-secret-pepper-that-is-not-so-secret';

// Maximum size for a file/DAG to be pinned via replication request, in bytes.
export const MAX_PIN_SIZE = 10 * 1024 * 1024; // 10 MB
