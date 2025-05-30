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
    version: '2.0.0',
    description: 'REST API for bulk cPanel account creation through WHM with polling support',
    endpoints: {
      whm: {
        'POST /api/whm/validate': 'Validate WHM credentials',
        'GET /api/whm/packages': 'Get available packages',
        'GET /api/whm/stats': 'Get server statistics'
      },
      bulk: {
        'POST /api/bulk/create': 'Start bulk account creation',
        'GET /api/bulk/validate-domains': 'Validate domains list (GET)',
        'POST /api/bulk/validate-domains': 'Validate domains list (POST)'
      },
      process: {
        'GET /api/process/:id/status': 'Get process status and progress',
        'GET /api/process/:id/logs': 'Get process logs',
        'GET /api/process/active': 'Get all active processes',
        'GET /api/process/stats': 'Get server statistics',
        'DELETE /api/process/:id': 'Cancel/delete process'
      }
    },
    polling: {
      description: 'Use REST API polling instead of websockets',
      recommendedInterval: '3000ms',
      endpoints: {
        status: 'GET /api/process/:id/status',
        logs: 'GET /api/process/:id/logs'
      }
    }
  });
});

module.exports = router;