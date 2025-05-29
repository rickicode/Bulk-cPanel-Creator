const winston = require('winston');

// Simple console format without JSON
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add important metadata in a simple format
    if (meta.environment) {
      msg += ` (env: ${meta.environment})`;
    }
    if (meta.port) {
      msg += ` (port: ${meta.port})`;
    }
    if (meta.host) {
      msg += ` (host: ${meta.host})`;
    }
    if (meta.username) {
      msg += ` (user: ${meta.username})`;
    }
    if (meta.processId) {
      msg += ` (process: ${meta.processId})`;
    }
    if (meta.domain) {
      msg += ` (domain: ${meta.domain})`;
    }
    if (meta.error && typeof meta.error === 'string') {
      msg += ` - Error: ${meta.error}`;
    }
    if (meta.ip) {
      msg += ` (ip: ${meta.ip})`;
    }
    if (meta.count !== undefined) {
      msg += ` (count: ${meta.count})`;
    }
    if (meta.totalClients !== undefined) {
      msg += ` (clients: ${meta.totalClients})`;
    }
    if (meta.duration !== undefined) {
      msg += ` (duration: ${meta.duration}ms)`;
    }
    if (meta.version) {
      msg += ` (version: ${meta.version})`;
    }
    
    return msg;
  })
);

// Create the logger with console output only
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: consoleFormat,
  transports: [
    new winston.transports.Console()
  ]
});

// Log application start with simple format
logger.info('Logger initialized', {
  level: logger.level,
  environment: process.env.NODE_ENV || 'development'
});

module.exports = logger;