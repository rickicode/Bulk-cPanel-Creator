const express = require('express');
const BulkCreator = require('../services/bulkCreator');
const logger = require('../utils/logger');
const { validateDomains, validateAccountGenerationRequest } = require('../utils/validator');

const router = express.Router();

// Initialize BulkCreator (will be set by middleware)
let bulkCreator = null;

// Middleware to initialize BulkCreator with processStateManager
router.use((req, res, next) => {
  if (!bulkCreator && req.processStateManager) {
    bulkCreator = new BulkCreator(req.processStateManager);
  }
  next();
});

/**
 * POST /api/bulk/create
 * Start bulk account creation process
 */
router.post('/create', async (req, res) => {
  try {
    if (!bulkCreator) {
      return res.status(500).json({
        success: false,
        error: 'Bulk creator service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Validate request data
    const validatedData = validateAccountGenerationRequest(req.body);

    logger.info('Starting bulk account creation', {
      domainCount: validatedData.domains.length,
      whmHost: validatedData.whmCredentials.host,
      ip: req.ip
    });

    // Start the bulk creation process
    const result = await bulkCreator.startBulkCreation(validatedData);

    res.json(result);

  } catch (error) {
    logger.error('Bulk creation start error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: error.message,
      code: 'BULK_CREATION_ERROR'
    });
  }
});

/**
 * GET /api/bulk/validate-domains
 * Validate a list of domains
 */
router.get('/validate-domains', (req, res) => {
  try {
    const { domains } = req.query;

    if (!domains) {
      return res.status(400).json({
        success: false,
        error: 'Domains parameter is required',
        code: 'MISSING_DOMAINS'
      });
    }

    // Parse domains - can be JSON array or newline-separated string
    let domainList;
    try {
      if (typeof domains === 'string') {
        // Try to parse as JSON first
        try {
          domainList = JSON.parse(domains);
        } catch {
          // If not JSON, treat as newline-separated string
          domainList = domains.split('\n').map(d => d.trim()).filter(d => d);
        }
      } else {
        domainList = domains;
      }
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domains format',
        code: 'INVALID_DOMAINS_FORMAT'
      });
    }

    if (!Array.isArray(domainList)) {
      return res.status(400).json({
        success: false,
        error: 'Domains must be an array',
        code: 'INVALID_DOMAINS_TYPE'
      });
    }

    // Validate domains
    const validation = validateDomains(domainList);

    logger.debug('Domain validation completed', {
      total: domainList.length,
      valid: validation.valid.length,
      invalid: validation.invalid.length,
      duplicates: validation.duplicates.length,
      ip: req.ip
    });

    res.json({
      success: true,
      data: {
        total: domainList.length,
        valid: validation.valid,
        invalid: validation.invalid,
        duplicates: validation.duplicates,
        summary: {
          validCount: validation.valid.length,
          invalidCount: validation.invalid.length,
          duplicateCount: validation.duplicates.length
        }
      }
    });

  } catch (error) {
    logger.error('Domain validation error:', {
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
 * POST /api/bulk/validate-domains
 * Validate domains from POST body (for large lists)
 */
router.post('/validate-domains', (req, res) => {
  try {
    const { domains } = req.body;

    if (!domains) {
      return res.status(400).json({
        success: false,
        error: 'Domains are required',
        code: 'MISSING_DOMAINS'
      });
    }

    // Handle different input formats
    let domainList;
    if (typeof domains === 'string') {
      // Split by newlines and clean up
      domainList = domains.split('\n')
        .map(d => d.trim())
        .filter(d => d);
    } else if (Array.isArray(domains)) {
      domainList = domains;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Domains must be a string or array',
        code: 'INVALID_DOMAINS_TYPE'
      });
    }

    // Validate domains
    const validation = validateDomains(domainList);

    logger.debug('Domain validation completed (POST)', {
      total: domainList.length,
      valid: validation.valid.length,
      invalid: validation.invalid.length,
      duplicates: validation.duplicates.length,
      ip: req.ip
    });

    res.json({
      success: true,
      data: {
        total: domainList.length,
        valid: validation.valid,
        invalid: validation.invalid,
        duplicates: validation.duplicates,
        summary: {
          validCount: validation.valid.length,
          invalidCount: validation.invalid.length,
          duplicateCount: validation.duplicates.length
        }
      }
    });

  } catch (error) {
    logger.error('Domain validation error (POST):', {
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
 * GET /api/bulk/template
 * Get a sample CSV template for bulk creation
 */
router.get('/template', (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    if (format === 'csv') {
      const csvContent = [
        'domain,email,plan',
        'example1.com,admin@example1.com,default',
        'example2.com,admin@example2.com,basic,1000,10000',
        'example3.com,admin@example3.com,premium,unlimited,unlimited'
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=cpanel_bulk_template.csv');
      res.send(csvContent);
    } else if (format === 'json') {
      const jsonTemplate = {
        whmCredentials: {
          host: "your-whm-server.com",
          port: 2087,
          username: "root",
          apiToken: "your-api-token-here",
          ssl: true
        },
        domains: [
          "example1.com",
          "example2.com",
          "example3.com"
        ],
        emailTemplate: "admin@{domain}",
        plan: "default"
      };

      res.json({
        success: true,
        template: jsonTemplate,
        description: "Template for bulk cPanel account creation"
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: csv, json',
        code: 'INVALID_FORMAT'
      });
    }

  } catch (error) {
    logger.error('Template generation error:', {
      error: error.message,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: error.message,
      code: 'TEMPLATE_ERROR'
    });
  }
});

module.exports = router;