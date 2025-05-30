const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/process/:processId/status
 * Get process status and progress
 */
router.get('/:processId/status', (req, res) => {
  try {
    const { processId } = req.params;
    
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const status = req.processStateManager.getProcessStatus(processId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Process status error:', {
      error: error.message,
      processId: req.params.processId,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STATUS_ERROR'
    });
  }
});

/**
 * GET /api/process/:processId/logs
 * Get process logs
 */
router.get('/:processId/logs', (req, res) => {
  try {
    const { processId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const logsData = req.processStateManager.getProcessLogs(
      processId, 
      parseInt(limit), 
      parseInt(offset)
    );

    res.json({
      success: true,
      data: logsData
    });

  } catch (error) {
    logger.error('Process logs error:', {
      error: error.message,
      processId: req.params.processId,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'LOGS_ERROR'
    });
  }
});

/**
 * GET /api/process/active
 * Get all active processes
 */
router.get('/active', (req, res) => {
  try {
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const activeProcesses = req.processStateManager.getActiveProcesses();

    res.json({
      success: true,
      data: {
        processes: activeProcesses,
        count: activeProcesses.length
      }
    });

  } catch (error) {
    logger.error('Active processes error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'ACTIVE_PROCESSES_ERROR'
    });
  }
});

/**
 * DELETE /api/process/:processId
 * Cancel/delete a process
 */
router.delete('/:processId', (req, res) => {
  try {
    const { processId } = req.params;
    
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Check if process exists first
    const status = req.processStateManager.getProcessStatus(processId);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    // If process is still running, mark it as cancelled
    if (status.status === 'running') {
      req.processStateManager.failProcess(processId, {
        message: 'Process cancelled by user',
        code: 'CANCELLED'
      });
    }

    // Delete the process data
    req.processStateManager.deleteProcess(processId);

    logger.info('Process cancelled/deleted:', { processId, ip: req.ip });

    res.json({
      success: true,
      message: 'Process cancelled and deleted'
    });

  } catch (error) {
    logger.error('Process deletion error:', {
      error: error.message,
      processId: req.params.processId,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'DELETION_ERROR'
    });
  }
});

/**
 * GET /api/process/stats
 * Get server statistics
 */
router.get('/stats', (req, res) => {
  try {
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const stats = req.processStateManager.getStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Process stats error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STATS_ERROR'
    });
  }
});

/**
 * GET /api/process/:processId/accounts
 * Get process accounts (successful, failed, skipped)
 */
router.get('/:processId/accounts', (req, res) => {
  try {
    const { processId } = req.params;
    
    if (!req.processStateManager) {
      return res.status(500).json({
        success: false,
        error: 'Process state manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const status = req.processStateManager.getProcessStatus(processId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    // Get process results from status
    const results = status.results || {
      successful: [],
      failed: [],
      skipped: []
    };

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Process accounts error:', {
      error: error.message,
      processId: req.params.processId,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'ACCOUNTS_ERROR'
    });
  }
});

module.exports = router;