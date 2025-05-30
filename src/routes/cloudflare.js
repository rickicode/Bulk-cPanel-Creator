const express = require('express');
const CloudflareApi = require('../services/cloudflareApi');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/cloudflare/validate
 * Test Cloudflare connection
 */
router.post('/validate', async (req, res) => {
  try {
    const { cloudflareCredentials } = req.body;

    if (!cloudflareCredentials) {
      return res.status(400).json({
        success: false,
        error: 'Cloudflare credentials are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Validate required fields
    if (!cloudflareCredentials.email || !cloudflareCredentials.apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Email and API key are required',
        code: 'INVALID_CREDENTIALS'
      });
    }

    logger.info('Testing Cloudflare connection', {
      email: cloudflareCredentials.email,
      ip: req.ip
    });

    // Initialize Cloudflare API client
    const cloudflareApi = new CloudflareApi(cloudflareCredentials);
    
    // Test connection
    const result = await cloudflareApi.testConnection();
    
    if (result.success) {
      logger.info('Cloudflare connection successful', {
        email: cloudflareCredentials.email,
        accountId: result.data.accountId,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Cloudflare connection successful',
        data: {
          email: result.data.email,
          accountId: result.data.accountId
        }
      });
    } else {
      logger.warn('Cloudflare connection failed', {
        email: cloudflareCredentials.email,
        error: result.error,
        ip: req.ip
      });

      res.status(400).json({
        success: false,
        error: result.error,
        code: 'CONNECTION_FAILED'
      });
    }

  } catch (error) {
    logger.error('Cloudflare validation error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'VALIDATION_ERROR'
    });
  }
});

/**
 * POST /api/cloudflare/zones
 * Get zones for a domain
 */
router.post('/zones', async (req, res) => {
  try {
    const { cloudflareCredentials, domain } = req.body;

    if (!cloudflareCredentials || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Cloudflare credentials and domain are required',
        code: 'MISSING_PARAMETERS'
      });
    }

    const cloudflareApi = new CloudflareApi(cloudflareCredentials);
    const result = await cloudflareApi.getZoneByDomain(domain);
    
    res.json(result);

  } catch (error) {
    logger.error('Cloudflare zones error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'ZONES_ERROR'
    });
  }
});

module.exports = router;