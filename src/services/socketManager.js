const logger = require('../utils/logger');

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connectedClients = new Map();
    this.activeProcesses = new Map();
    
    logger.info('Socket Manager initialized');
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const clientId = socket.id;
    const clientInfo = {
      id: clientId,
      connectedAt: new Date(),
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    };

    this.connectedClients.set(clientId, clientInfo);
    
    logger.info('Client connected:', {
      clientId,
      ip: clientInfo.ip,
      totalClients: this.connectedClients.size
    });

    // Send welcome message
    socket.emit('connected', {
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Connected to cPanel Bulk Creator'
    });

    // Handle process subscription
    socket.on('subscribe-process', (processId) => {
      socket.join(`process-${processId}`);
      logger.debug(`Client ${clientId} subscribed to process ${processId}`);
    });

    // Handle process unsubscription
    socket.on('unsubscribe-process', (processId) => {
      socket.leave(`process-${processId}`);
      logger.debug(`Client ${clientId} unsubscribed from process ${processId}`);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.connectedClients.delete(clientId);
      logger.info('Client disconnected:', {
        clientId,
        reason,
        totalClients: this.connectedClients.size
      });
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });
  }

  /**
   * Start a new process and notify subscribers
   */
  startProcess(processId, processInfo) {
    this.activeProcesses.set(processId, {
      ...processInfo,
      startedAt: new Date(),
      status: 'running'
    });

    this.broadcast(`process-${processId}`, 'process-started', {
      processId,
      ...processInfo,
      timestamp: new Date().toISOString()
    });

    logger.info('Process started:', { processId, ...processInfo });
  }

  /**
   * Send process update to subscribers
   */
  sendProcessUpdate(processId, update) {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      logger.warn('Attempted to update non-existent process:', processId);
      return;
    }

    const updateData = {
      processId,
      timestamp: new Date().toISOString(),
      ...update
    };

    this.broadcast(`process-${processId}`, 'process-update', updateData);
    
    logger.debug('Process update sent:', { processId, update: update.type || 'unknown' });
  }

  /**
   * Send log message for a process
   */
  sendLog(processId, logData) {
    const logMessage = {
      processId,
      timestamp: new Date().toISOString(),
      level: logData.level || 'info',
      message: logData.message,
      data: logData.data || {},
      ...logData
    };

    this.broadcast(`process-${processId}`, 'log', logMessage);
    
    // Also log to file
    logger.log(logMessage.level, `[Process ${processId}] ${logMessage.message}`, logMessage.data);
  }

  /**
   * Send progress update for a process
   */
  sendProgress(processId, progress) {
    const progressData = {
      processId,
      timestamp: new Date().toISOString(),
      current: progress.current || 0,
      total: progress.total || 0,
      percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
      currentItem: progress.currentItem || null,
      status: progress.status || 'processing',
      ...progress
    };

    this.broadcast(`process-${processId}`, 'progress', progressData);
    
    logger.debug('Progress update sent:', { processId, percentage: progressData.percentage });
  }

  /**
   * Complete a process
   */
  completeProcess(processId, results) {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      logger.warn('Attempted to complete non-existent process:', processId);
      return;
    }

    const completionData = {
      processId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - new Date(process.startedAt).getTime(),
      status: 'completed',
      ...results
    };

    // Update process status
    process.status = 'completed';
    process.completedAt = new Date();
    process.results = results;

    this.broadcast(`process-${processId}`, 'process-completed', completionData);
    
    logger.info('Process completed:', { processId, duration: completionData.duration });
    
    // Clean up process after a delay
    setTimeout(() => {
      this.activeProcesses.delete(processId);
      logger.debug('Process cleaned up:', processId);
    }, 60000); // Keep for 1 minute after completion
  }

  /**
   * Fail a process
   */
  failProcess(processId, error) {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      logger.warn('Attempted to fail non-existent process:', processId);
      return;
    }

    const failureData = {
      processId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - new Date(process.startedAt).getTime(),
      status: 'failed',
      error: {
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR',
        details: error.details || null
      }
    };

    // Update process status
    process.status = 'failed';
    process.failedAt = new Date();
    process.error = error;

    this.broadcast(`process-${processId}`, 'process-failed', failureData);
    
    logger.error('Process failed:', { processId, error: error.message });
    
    // Clean up process after a delay
    setTimeout(() => {
      this.activeProcesses.delete(processId);
      logger.debug('Failed process cleaned up:', processId);
    }, 300000); // Keep for 5 minutes after failure
  }

  /**
   * Broadcast message to a room
   */
  broadcast(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  /**
   * Send message to all connected clients
   */
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  /**
   * Get process status
   */
  getProcessStatus(processId) {
    return this.activeProcesses.get(processId) || null;
  }

  /**
   * Get all active processes
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.values());
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      activeProcesses: this.activeProcesses.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SocketManager;