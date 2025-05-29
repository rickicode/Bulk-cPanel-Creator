const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/process/:id
 * Get specific process status
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!req.socketManager) {
      return res.status(500).json({
        success: false,
        error: 'Socket manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const processStatus = req.socketManager.getProcessStatus(id);

    if (!processStatus) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    logger.debug('Process status retrieved', {
      processId: id,
      status: processStatus.status,
      ip: req.ip
    });

    res.json({
      success: true,
      data: processStatus
    });

  } catch (error) {
    logger.error('Process status retrieval error:', {
      processId: req.params.id,
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'PROCESS_STATUS_ERROR'
    });
  }
});

/**
 * DELETE /api/process/:id
 * Cancel a running process
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!req.socketManager) {
      return res.status(500).json({
        success: false,
        error: 'Socket manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Check if process exists
    const processStatus = req.socketManager.getProcessStatus(id);
    if (!processStatus) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    // Check if process can be cancelled
    if (processStatus.status === 'completed' || processStatus.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel completed or failed process',
        code: 'PROCESS_NOT_CANCELLABLE'
      });
    }

    // Cancel the process
    req.socketManager.failProcess(id, new Error('Process cancelled by user'));

    logger.info('Process cancelled', {
      processId: id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Process cancelled successfully',
      processId: id
    });

  } catch (error) {
    logger.error('Process cancellation error:', {
      processId: req.params.id,
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'PROCESS_CANCELLATION_ERROR'
    });
  }
});

/**
 * GET /api/process
 * Get all active processes
 */
router.get('/', (req, res) => {
  try {
    if (!req.socketManager) {
      return res.status(500).json({
        success: false,
        error: 'Socket manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const activeProcesses = req.socketManager.getActiveProcesses();

    logger.debug('Active processes retrieved', {
      count: activeProcesses.length,
      ip: req.ip
    });

    res.json({
      success: true,
      data: activeProcesses,
      count: activeProcesses.length
    });

  } catch (error) {
    logger.error('Active processes retrieval error:', {
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
 * GET /api/process/:id/export
 * Export process results
 */
router.get('/:id/export', (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;

    if (!req.socketManager) {
      return res.status(500).json({
        success: false,
        error: 'Socket manager not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const processStatus = req.socketManager.getProcessStatus(id);

    if (!processStatus) {
      return res.status(404).json({
        success: false,
        error: 'Process not found',
        code: 'PROCESS_NOT_FOUND'
      });
    }

    if (!processStatus.results) {
      return res.status(400).json({
        success: false,
        error: 'Process has no results to export',
        code: 'NO_RESULTS'
      });
    }

    const { successful, failed, skipped } = processStatus.results;
    const allResults = [...successful, ...failed, ...skipped];

    if (format === 'csv') {
      // Generate CSV content
      const headers = ['Domain', 'Username', 'Password', 'Email', 'Status', 'Message'];
      const csvRows = [headers.join(',')];

      allResults.forEach(result => {
        const row = [
          result.domain || '',
          result.username || '',
          result.success ? (result.password || '') : '',
          result.email || '',
          result.success ? 'Success' : (result.error ? 'Failed' : 'Skipped'),
          result.success ? (result.message || 'Created successfully') : (result.error || 'Unknown error')
        ];
        
        // Escape CSV values
        const escapedRow = row.map(field => {
          if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        });
        
        csvRows.push(escapedRow.join(','));
      });

      const csvContent = csvRows.join('\n');
      const filename = `cpanel_bulk_results_${id}_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csvContent);

      logger.info('Process results exported as CSV', {
        processId: id,
        resultCount: allResults.length,
        ip: req.ip
      });

    } else if (format === 'json') {
      const filename = `cpanel_bulk_results_${id}_${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.json({
        processId: id,
        exportedAt: new Date().toISOString(),
        summary: {
          total: allResults.length,
          successful: successful.length,
          failed: failed.length,
          skipped: skipped.length
        },
        results: {
          successful,
          failed,
          skipped
        }
      });

      logger.info('Process results exported as JSON', {
        processId: id,
        resultCount: allResults.length,
        ip: req.ip
      });

    } else if (format === 'txt') {
      // Generate plain text format
      const lines = [];
      lines.push(`cPanel Bulk Creation Results - Process ${id}`);
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push('=' .repeat(60));
      lines.push('');
      
      lines.push(`Summary:`);
      lines.push(`- Total: ${allResults.length}`);
      lines.push(`- Successful: ${successful.length}`);
      lines.push(`- Failed: ${failed.length}`);
      lines.push(`- Skipped: ${skipped.length}`);
      lines.push('');

      if (successful.length > 0) {
        lines.push('SUCCESSFUL ACCOUNTS:');
        lines.push('-' .repeat(40));
        successful.forEach(result => {
          lines.push(`Domain: ${result.domain}`);
          lines.push(`Username: ${result.username}`);
          lines.push(`Password: ${result.password}`);
          lines.push(`Email: ${result.email}`);
          lines.push('');
        });
      }

      if (failed.length > 0) {
        lines.push('FAILED ACCOUNTS:');
        lines.push('-' .repeat(40));
        failed.forEach(result => {
          lines.push(`Domain: ${result.domain}`);
          lines.push(`Username: ${result.username || 'N/A'}`);
          lines.push(`Error: ${result.error}`);
          lines.push('');
        });
      }

      if (skipped.length > 0) {
        lines.push('SKIPPED ACCOUNTS:');
        lines.push('-' .repeat(40));
        skipped.forEach(result => {
          lines.push(`Domain: ${result.domain}`);
          lines.push(`Reason: ${result.error}`);
          lines.push('');
        });
      }

      const txtContent = lines.join('\n');
      const filename = `cpanel_bulk_results_${id}_${new Date().toISOString().split('T')[0]}.txt`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(txtContent);

      logger.info('Process results exported as TXT', {
        processId: id,
        resultCount: allResults.length,
        ip: req.ip
      });

    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: csv, json, txt',
        code: 'INVALID_FORMAT'
      });
    }

  } catch (error) {
    logger.error('Process export error:', {
      processId: req.params.id,
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'EXPORT_ERROR'
    });
  }
});

/**
 * GET /api/process/:id/logs
 * Get process logs (if stored)
 */
router.get('/:id/logs', (req, res) => {
  try {
    const { id } = req.params;

    // This would typically fetch logs from a database or log file
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Log retrieval not implemented yet',
      processId: id,
      data: []
    });

  } catch (error) {
    logger.error('Process logs retrieval error:', {
      processId: req.params.id,
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'LOGS_RETRIEVAL_ERROR'
    });
  }
});

module.exports = router;