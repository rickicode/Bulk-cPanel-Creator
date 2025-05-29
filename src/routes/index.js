const express = require('express');
const whmRoutes = require('./whm');
const bulkRoutes = require('./bulk');
const processRoutes = require('./process');

const router = express.Router();

// API Routes
router.use('/whm', whmRoutes);
router.use('/bulk', bulkRoutes);
router.use('/process', processRoutes);

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'cPanel Bulk Creator API',
    version: '1.0.0',
    description: 'API for bulk cPanel account creation through WHM',
    endpoints: {
      whm: {
        'POST /api/whm/validate': 'Validate WHM credentials',
        'GET /api/whm/packages': 'Get available packages',
        'GET /api/whm/stats': 'Get server statistics'
      },
      bulk: {
        'POST /api/bulk/create': 'Start bulk account creation',
        'GET /api/bulk/validate-domains': 'Validate domains list'
      },
      process: {
        'GET /api/process/:id': 'Get process status',
        'DELETE /api/process/:id': 'Cancel process',
        'GET /api/process': 'Get all active processes'
      }
    },
    websocket: {
      endpoint: '/ws',
      events: {
        connected: 'Connection established',
        'process-started': 'Process started',
        'process-update': 'Process update',
        'process-completed': 'Process completed',
        'process-failed': 'Process failed',
        log: 'Log message',
        progress: 'Progress update'
      }
    }
  });
});

module.exports = router;