const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Simple console logger for serverless environment
const logger = {
  debug: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [DEBUG]: ${message}`, Object.keys(meta || {}).length > 0 ? meta : '');
  },
  info: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [INFO]: ${message}`, Object.keys(meta || {}).length > 0 ? meta : '');
  },
  warn: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`${timestamp} [WARN]: ${message}`, Object.keys(meta || {}).length > 0 ? meta : '');
  },
  error: (message, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [ERROR]: ${message}`, Object.keys(meta || {}).length > 0 ? meta : '');
  },
  log: (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const upperLevel = level.toUpperCase();
    const logMethod = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
    logMethod(`${timestamp} [${upperLevel}]: ${message}`, Object.keys(meta || {}).length > 0 ? meta : '');
  }
};

// Make logger available globally for routes
global.logger = logger;

// Import custom modules with error handling
let routes;
let ProcessStateManager;
let processStateManager;

try {
  // Override the logger import in the modules
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  
  Module.prototype.require = function(id) {
    if (id === '../utils/logger' || id.endsWith('/utils/logger')) {
      return logger;
    }
    return originalRequire.apply(this, arguments);
  };
  
  routes = require('../src/routes');
  
  // For serverless environment, create a lightweight process manager
  // Note: In Vercel serverless, state doesn't persist between function calls
  processStateManager = {
    startProcess: (processId, processInfo) => {
      logger.info('Process started (serverless mode)', { processId, ...processInfo });
      return { processId, status: 'running', startedAt: new Date(), ...processInfo };
    },
    updateProgress: (processId, progressData) => {
      logger.debug('Progress update (serverless mode)', { processId, ...progressData });
    },
    addLog: (processId, logEntry) => {
      logger.log(logEntry.level, `[Process ${processId}] ${logEntry.message}`, logEntry.data);
    },
    completeProcess: (processId, completionData) => {
      logger.info('Process completed (serverless mode)', { processId, ...completionData });
    },
    failProcess: (processId, error) => {
      logger.error('Process failed (serverless mode)', { processId, error: error.message });
    },
    getProcessStatus: (processId) => {
      return { processId, status: 'unknown', message: 'Serverless mode - status not persistent' };
    },
    getProcessLogs: (processId) => {
      return { processId, logs: [], message: 'Serverless mode - logs not persistent' };
    },
    getActiveProcesses: () => {
      return [];
    },
    getStats: () => {
      return { activeProcesses: 0, totalLogs: 0 };
    },
    deleteProcess: (processId) => {
      logger.info('Process deleted (serverless mode)', { processId });
    }
  };
  
  // Restore original require
  Module.prototype.require = originalRequire;
  
  logger.info('Routes and ProcessStateManager loaded successfully');
  
} catch (error) {
  logger.error('Failed to import routes or ProcessStateManager', {
    error: error.message,
    stack: error.stack
  });
  routes = express.Router();
  routes.get('/', (req, res) => {
    res.json({
      error: 'Routes not available',
      message: 'API is in recovery mode',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  });
}

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration for Vercel
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for Vercel
app.set('trust proxy', 1);

// Make processStateManager available to routes
if (processStateManager) {
  app.use((req, res, next) => {
    req.processStateManager = processStateManager;
    next();
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'vercel'
  };
  
  // Add process stats if processStateManager is available
  if (processStateManager) {
    try {
      const stats = processStateManager.getStats();
      healthData.processes = {
        active: stats.activeProcesses,
        totalLogs: stats.totalLogs
      };
    } catch (error) {
      logger.warn('Failed to get process stats for health check', { error: error.message });
    }
  }
  
  res.json(healthData);
});

// API routes
app.use('/api', routes);

// For non-API routes, redirect to Vercel's static file handling
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// Catch-all for non-API routes
app.get('*', (req, res) => {
  // Let Vercel handle static files
  if (req.path.match(/\.(css|js|html|ico|png|jpg|jpeg|gif|svg)$/)) {
    res.status(404).json({ error: 'File not found' });
  } else {
    res.redirect('/index.html');
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Server error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

logger.info('Express app initialized successfully');

// Export for Vercel
module.exports = app;