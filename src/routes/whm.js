const express = require('express');
const WHMApi = require('../services/whmApi');
const logger = require('../utils/logger');
const { validateWhmCredentials } = require('../utils/validator');

const router = express.Router();

/**
 * POST /api/whm/validate
 * Validate WHM credentials and test connection
 */
router.post('/validate', async (req, res) => {
  try {
    const { whmCredentials } = req.body;

    if (!whmCredentials) {
      return res.status(400).json({
        success: false,
        error: 'WHM credentials are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Validate credentials format
    const validatedCredentials = validateWhmCredentials(whmCredentials);
    
    // Create WHM API instance and test connection
    const whmApi = new WHMApi(validatedCredentials);
    const result = await whmApi.testConnection();

    if (result.success) {
      logger.info('WHM credentials validated successfully', {
        host: validatedCredentials.host,
        username: validatedCredentials.username,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'WHM credentials are valid',
        data: {
          version: result.version,
          build: result.build,
          host: validatedCredentials.host,
          username: validatedCredentials.username
        }
      });
    } else {
      logger.warn('WHM credentials validation failed', {
        host: validatedCredentials.host,
        username: validatedCredentials.username,
        error: result.error,
        ip: req.ip
      });

      res.status(401).json({
        success: false,
        error: result.error,
        code: result.code || 'VALIDATION_FAILED'
      });
    }

  } catch (error) {
    logger.error('WHM validation error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: error.message,
      code: 'VALIDATION_ERROR'
    });
  }
});

/**
 * POST /api/whm/packages
 * Get available packages/plans from WHM
 */
router.post('/packages', async (req, res) => {
  try {
    const { whmCredentials } = req.body;

    if (!whmCredentials) {
      return res.status(400).json({
        success: false,
        error: 'WHM credentials are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const validatedCredentials = validateWhmCredentials(whmCredentials);
    const whmApi = new WHMApi(validatedCredentials);
    
    const result = await whmApi.getPackages();

    if (result.success) {
      logger.debug('Packages retrieved successfully', {
        count: result.packages.length,
        host: validatedCredentials.host
      });

      res.json({
        success: true,
        data: {
          packages: result.packages
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        code: 'PACKAGES_FETCH_FAILED'
      });
    }

  } catch (error) {
    logger.error('Packages retrieval error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: error.message,
      code: 'PACKAGES_ERROR'
    });
  }
});

/**
 * GET /api/whm/stats
 * Get server statistics from WHM
 */
router.get('/stats', async (req, res) => {
  try {
    const { whmCredentials } = req.query;

    if (!whmCredentials) {
      return res.status(400).json({
        success: false,
        error: 'WHM credentials are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Parse credentials if sent as JSON string
    let credentials;
    try {
      credentials = typeof whmCredentials === 'string' 
        ? JSON.parse(whmCredentials) 
        : whmCredentials;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials format',
        code: 'INVALID_CREDENTIALS_FORMAT'
      });
    }

    const validatedCredentials = validateWhmCredentials(credentials);
    const whmApi = new WHMApi(validatedCredentials);
    
    const result = await whmApi.getServerStats();

    if (result.success) {
      res.json({
        success: true,
        data: result.stats
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        code: 'STATS_FETCH_FAILED'
      });
    }

  } catch (error) {
    logger.error('Server stats retrieval error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: error.message,
      code: 'STATS_ERROR'
    });
  }
});

/**
 * GET /api/whm/accounts
 * List accounts from WHM
 */
router.get('/accounts', async (req, res) => {
  try {
    const { whmCredentials, search } = req.query;

    if (!whmCredentials) {
      return res.status(400).json({
        success: false,
        error: 'WHM credentials are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Parse credentials if sent as JSON string
    let credentials;
    try {
      credentials = typeof whmCredentials === 'string' 
        ? JSON.parse(whmCredentials) 
        : whmCredentials;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials format',
        code: 'INVALID_CREDENTIALS_FORMAT'
      });
    }

    const validatedCredentials = validateWhmCredentials(credentials);
    const whmApi = new WHMApi(validatedCredentials);
    
    const result = await whmApi.listAccounts(search);

    if (result.success) {
      logger.debug('Accounts retrieved successfully', {
        count: result.accounts.length,
        host: validatedCredentials.host,
        search: search || 'all'
      });

      res.json({
        success: true,
        data: result.accounts,
        count: result.accounts.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        code: 'ACCOUNTS_FETCH_FAILED'
      });
    }

  } catch (error) {
    logger.error('Accounts retrieval error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: error.message,
      code: 'ACCOUNTS_ERROR'
    });
  }
});

module.exports = router;