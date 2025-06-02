const logger = require('../utils/logger');

class ProcessStateManager {
  constructor() {
    this.activeProcesses = new Map();
    this.processLogs = new Map();
    this.processProgress = new Map();
    
    logger.info('Process State Manager initialized');
    
    // Note: Removed setInterval as it doesn't work in serverless environments
    // Cleanup will be called manually when needed
  }

  /**
   * Start a new process
   */
  startProcess(processId, processInfo) {
    const processData = {
      ...processInfo,
      processId,
      startedAt: new Date(),
      status: 'running',
      logs: [],
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        status: 'starting'
      }
    };

    this.activeProcesses.set(processId, processData);
    this.processLogs.set(processId, []);
    this.processProgress.set(processId, processData.progress);

    this.addLog(processId, {
      level: 'info',
      message: 'Process started',
      timestamp: new Date().toISOString(),
      data: processInfo
    });

    logger.info('Process started:', { processId, ...processInfo });
    return processData;
  }

  /**
   * Add log to process
   */
  addLog(processId, logData) {
    if (!this.processLogs.has(processId)) {
      this.processLogs.set(processId, []);
    }

    const logEntry = {
      processId,
      timestamp: new Date().toISOString(),
      level: logData.level || 'info',
      message: logData.message,
      data: logData.data || {},
      ...logData
    };

    const logs = this.processLogs.get(processId);
    logs.push(logEntry);

    // Keep only last 1000 log entries per process
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }

    // Also log to file
    logger.log(logEntry.level, `[Process ${processId}] ${logEntry.message}`, {
      processId,
      ...logEntry.data
    });
  }

  /**
   * Update process progress
   */
  updateProgress(processId, progress) {
    const progressData = {
      processId,
      timestamp: new Date().toISOString(),
      current: progress.current || 0,
      total: progress.total || 0,
      percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
      currentItem: progress.currentItem || null,
      status: progress.status || 'processing',
      successful: progress.successful || 0,
      failed: progress.failed || 0,
      skipped: progress.skipped || 0,
      ...progress
    };

    this.processProgress.set(processId, progressData);

    // Update process data
    const process = this.activeProcesses.get(processId);
    if (process) {
      process.progress = progressData;
      process.lastUpdated = new Date();
    }

    logger.debug('Progress update:', { processId, percentage: progressData.percentage });
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
    process.completion = completionData;

    this.addLog(processId, {
      level: 'info',
      message: 'Process completed successfully',
      data: completionData
    });

    logger.info('Process completed:', { processId, duration: completionData.duration });
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
    process.failure = failureData;

    this.addLog(processId, {
      level: 'error',
      message: `Process failed: ${error.message}`,
      data: failureData
    });

    logger.error('Process failed:', { processId, error: error.message });
  }

  /**
   * Get process status
   */
  getProcessStatus(processId) {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      return null;
    }

    return {
      processId,
      status: process.status,
      startedAt: process.startedAt,
      lastUpdated: process.lastUpdated || process.startedAt,
      progress: this.processProgress.get(processId) || process.progress,
      completedAt: process.completedAt,
      failedAt: process.failedAt,
      results: process.results,
      error: process.error,
      completion: process.completion,
      failure: process.failure
    };
  }

  /**
   * Get process logs
   */
  getProcessLogs(processId, limit = 100, offset = 0) {
    const logs = this.processLogs.get(processId) || [];
    
    // For offset-based pagination, return logs starting from offset
    const startIndex = offset;
    const endIndex = Math.min(logs.length, offset + limit);
    
    return {
      logs: logs.slice(startIndex, endIndex),
      total: logs.length,
      hasMore: endIndex < logs.length
    };
  }

  /**
   * Get all active processes
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([processId, process]) => ({
      processId,
      status: process.status,
      startedAt: process.startedAt,
      lastUpdated: process.lastUpdated || process.startedAt,
      progress: this.processProgress.get(processId) || process.progress
    }));
  }

  /**
   * Delete a process
   */
  deleteProcess(processId) {
    this.activeProcesses.delete(processId);
    this.processLogs.delete(processId);
    this.processProgress.delete(processId);
    logger.debug('Process deleted:', processId);
  }

  /**
   * Clean up old completed processes
   */
  cleanupOldProcesses() {
    const now = Date.now();
    const cleanupThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [processId, process] of this.activeProcesses.entries()) {
      const isCompleted = process.status === 'completed' || process.status === 'failed';
      const completionTime = process.completedAt || process.failedAt;
      
      if (isCompleted && completionTime && (now - completionTime.getTime()) > cleanupThreshold) {
        this.deleteProcess(processId);
        logger.debug('Cleaned up old process:', processId);
      }
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      activeProcesses: this.activeProcesses.size,
      totalLogs: Array.from(this.processLogs.values()).reduce((total, logs) => total + logs.length, 0),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ProcessStateManager;