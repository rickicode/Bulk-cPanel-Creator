require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import custom modules
const logger = require('./src/utils/logger');
const routes = require('./src/routes');
const { validateEnvVariables } = require('./src/utils/validator');
const ProcessStateManager = require('./src/services/processStateManager');

// Validate environment variables
validateEnvVariables();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : "*",
  credentials: true
}));


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Process State Manager
const processStateManager = new ProcessStateManager();

// --- Periodic polling timeout checker ---
const PROCESS_POLL_TIMEOUT_MS = 30 * 1000; // 30 seconds
setInterval(() => {
  const now = Date.now();
  const active = processStateManager.getActiveProcesses();
  active.forEach(proc => {
    if (
      proc.status === 'running' &&
      proc.lastPolledAt &&
      now - new Date(proc.lastPolledAt).getTime() > PROCESS_POLL_TIMEOUT_MS
    ) {
      processStateManager.failProcess(proc.processId, {
        message: 'Process stopped: frontend polling timeout (disconnected or refreshed)',
        code: 'POLL_TIMEOUT'
      });
    }
  });
}, 10000); // Check every 10 seconds

// Make processStateManager available to routes
app.use((req, res, next) => {
  req.processStateManager = processStateManager;
  next();
});

// API Routes
app.use('/api', routes);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve WordPress Admin Changer page
app.get('/wordpress-admin-changer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wordpress-admin-changer.html'));
});

// Serve cPanel Bulk Delete page
app.get('/cpanel-bulk-delete', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cpanel-bulk-delete.html'));
});

// Serve All-in-One page
app.get('/all-in-one', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'all-in-one.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = processStateManager.getStats();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '2.0.0',
    processes: {
      active: stats.activeProcesses,
      totalLogs: stats.totalLogs
    }
  });
});

// 404 handler - Always serve 404.html page
app.use('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`REST API Server running on port ${PORT}`, {
    environment: process.env.NODE_ENV,
    port: PORT,
    timestamp: new Date().toISOString(),
    mode: 'REST_POLLING'
  });
});

module.exports = { app, server, processStateManager };
