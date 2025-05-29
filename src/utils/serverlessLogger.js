/**
 * Simplified logger for serverless environments
 * Fallback when winston logger is not available
 */

const logger = {
  info: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [INFO]: ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  warn: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`${timestamp} [WARN]: ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  error: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [ERROR]: ${message}`, Object.keys(meta).length > 0 ? meta : '');
  },
  
  debug: (message, meta = {}) => {
    if (process.env.LOG_LEVEL === 'debug') {
      const timestamp = new Date().toISOString();
      console.debug(`${timestamp} [DEBUG]: ${message}`, Object.keys(meta).length > 0 ? meta : '');
    }
  }
};

module.exports = logger;