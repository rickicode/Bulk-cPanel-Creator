const { v4: uuidv4 } = require('uuid');
const WHMApi = require('./whmApi');
const CloudflareApi = require('./cloudflareApi');
const logger = require('../utils/logger');
const {
  validateDomains,
  sanitizeUsername,
  generateSecurePassword
} = require('../utils/validator');

class BulkCreator {
  constructor(processStateManager) {
    this.processStateManager = processStateManager;
    this.activeProcesses = new Map();
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ACCOUNTS) || 5;
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 10;
    
    logger.info('Bulk Creator service initialized', {
      maxConcurrent: this.maxConcurrent,
      batchSize: this.batchSize
    });
  }

  /**
   * Start bulk account creation process
   */
  async startBulkCreation(requestData) {
    const processId = uuidv4();
    
    try {
      // Validate and prepare domains
      const domainValidation = validateDomains(requestData.domains);
      
      if (domainValidation.valid.length === 0) {
        throw new Error('No valid domains provided');
      }

      // Initialize WHM API client
      const whmApi = new WHMApi(requestData.whmCredentials);
      
      // Test WHM connection first
      const connectionTest = await whmApi.testConnection();
      if (!connectionTest.success) {
        throw new Error(`WHM connection failed: ${connectionTest.error}`);
      }

      // Initialize Cloudflare API client if credentials provided
      let cloudflareApi = null;
      if (requestData.cloudflareCredentials) {
        cloudflareApi = new CloudflareApi(requestData.cloudflareCredentials);
        
        // Test Cloudflare connection
        const cfConnectionTest = await cloudflareApi.testConnection();
        if (!cfConnectionTest.success) {
          throw new Error(`Cloudflare connection failed: ${cfConnectionTest.error}`);
        }
        
        logger.info('Cloudflare DNS integration enabled', {
          email: requestData.cloudflareCredentials.email,
          recordType: requestData.cloudflareCredentials.recordType,
          recordValue: requestData.cloudflareCredentials.recordValue
        });
      }

      // Prepare process data
      const processData = {
        processId,
        totalDomains: domainValidation.valid.length,
        invalidDomains: domainValidation.invalid.length,
        duplicateDomains: domainValidation.duplicates.length,
        requestData: {
          ...requestData,
          domains: domainValidation.valid // Use only valid domains
        },
        status: 'initializing',
        results: {
          successful: [],
          failed: [],
          skipped: []
        },
        stats: {
          processed: 0,
          successful: 0,
          failed: 0,
          skipped: 0
        }
      };

      // Store process
      this.activeProcesses.set(processId, processData);

      // Start the process
      this.processStateManager.startProcess(processId, {
        type: 'bulk-account-creation',
        totalDomains: processData.totalDomains,
        invalidDomains: processData.invalidDomains,
        duplicateDomains: processData.duplicateDomains
      });

      // Send validation results
      if (domainValidation.invalid.length > 0 || domainValidation.duplicates.length > 0) {
        this.processStateManager.addLog(processId, {
          level: 'warn',
          message: 'Domain validation issues detected',
          data: {
            invalid: domainValidation.invalid,
            duplicates: domainValidation.duplicates
          }
        });
      }

      // Start processing in background
      this.processDomainsInBatches(processId, whmApi, cloudflareApi)
        .catch(error => {
          logger.error('Bulk creation process failed:', { processId, error: error.message });
          this.processStateManager.failProcess(processId, error);
        });

      return {
        success: true,
        processId,
        message: 'Bulk account creation started',
        totalDomains: processData.totalDomains,
        invalidDomains: processData.invalidDomains,
        duplicateDomains: processData.duplicateDomains
      };

    } catch (error) {
      logger.error('Failed to start bulk creation:', { error: error.message });
      
      if (this.activeProcesses.has(processId)) {
        this.processStateManager.failProcess(processId, error);
      }
      
      throw error;
    }
  }

  /**
   * Process domains in batches with concurrency control
   */
  async processDomainsInBatches(processId, whmApi, cloudflareApi = null) {
    const processData = this.activeProcesses.get(processId);
    if (!processData) {
      throw new Error('Process data not found');
    }

    const domains = processData.requestData.domains;
    const batches = this.createBatches(domains, this.batchSize);

    this.processStateManager.addLog(processId, {
      level: 'info',
      message: `Starting batch processing: ${batches.length} batches, ${domains.length} total domains`
    });

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        this.processStateManager.addLog(processId, {
          level: 'info',
          message: `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} domains)`
        });

        // Process batch with concurrency control
        await this.processBatch(processId, whmApi, batch, batchIndex + 1, cloudflareApi);

        // Update progress
        this.updateProgress(processId);

        // Small delay between batches to prevent overwhelming the server
        if (batchIndex < batches.length - 1) {
          await this.delay(1000);
        }
      }

      // Complete the process
      const finalData = this.activeProcesses.get(processId);
      this.processStateManager.completeProcess(processId, {
        totalProcessed: finalData.stats.processed,
        successful: finalData.stats.successful,
        failed: finalData.stats.failed,
        skipped: finalData.stats.skipped,
        results: finalData.results
      });

    } catch (error) {
      this.processStateManager.failProcess(processId, error);
      throw error;
    }
  }

  /**
   * Process a single batch of domains
   */
  async processBatch(processId, whmApi, batch, batchNumber, cloudflareApi = null) {
    const promises = batch.map((domain, index) =>
      () => this.processSingleDomain(processId, whmApi, domain, batchNumber, index + 1, cloudflareApi)
    );

    // Process with concurrency limit
    const results = await this.processWithConcurrencyLimit(promises, this.maxConcurrent);
    
    this.processStateManager.addLog(processId, {
      level: 'info',
      message: `Batch ${batchNumber} completed`,
      data: {
        total: batch.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });

    return results;
  }

  /**
   * Process a single domain
   */
  async processSingleDomain(processId, whmApi, domain, batchNumber, domainIndex, cloudflareApi = null) {
    const processData = this.activeProcesses.get(processId);
    if (!processData) {
      throw new Error('Process data not found');
    }

    try {
      this.processStateManager.addLog(processId, {
        level: 'info',
        message: `Processing domain: ${domain}`,
        data: { domain, batchNumber, domainIndex }
      });

      // Check if domain already exists
      const existsCheck = await whmApi.checkDomainExists(domain);
      if (existsCheck.success && existsCheck.exists) {
        const result = {
          success: false,
          domain,
          error: 'Domain already exists',
          code: 'DOMAIN_EXISTS'
        };

        processData.results.skipped.push(result);
        processData.stats.skipped++;
        processData.stats.processed++;

        this.processStateManager.addLog(processId, {
          level: 'warn',
          message: `Domain ${domain} already exists, skipping`
        });

        return result;
      }

      // Add Cloudflare DNS record if Cloudflare credentials provided
      if (cloudflareApi) {
        try {
          this.processStateManager.addLog(processId, {
            level: 'info',
            message: `Creating DNS record for ${domain}`,
            data: { domain, recordType: cloudflareApi.recordType, recordValue: cloudflareApi.recordValue }
          });

          const dnsResult = await cloudflareApi.addOrUpdateDnsRecord(domain);
          if (dnsResult.success) {
            this.processStateManager.addLog(processId, {
              level: 'info',
              message: `DNS record created successfully for ${domain}`,
              data: { domain, recordType: cloudflareApi.recordType, recordValue: cloudflareApi.recordValue }
            });
          } else {
            this.processStateManager.addLog(processId, {
              level: 'warn',
              message: `Failed to create DNS record for ${domain}: ${dnsResult.error}`,
              data: { domain, error: dnsResult.error }
            });
          }
        } catch (dnsError) {
          this.processStateManager.addLog(processId, {
            level: 'warn',
            message: `DNS record creation error for ${domain}: ${dnsError.message}`,
            data: { domain, error: dnsError.message }
          });
        }
      }

      // Generate account data
      const username = sanitizeUsername(domain);
      const password = generateSecurePassword();
      const email = `admin@${domain}`;

      const accountData = {
        domain,
        username,
        password,
        email,
        plan: processData.requestData.plan,
        quota: "unlimited",
        bwlimit: "unlimited",
        maxaddons: processData.requestData.maxaddons,
        maxparked: processData.requestData.maxparked,
        maxsubs: processData.requestData.maxsubs,
        maxsql: processData.requestData.maxsql,
        hasshell: false,
        cgi: true
      };

      // Create the account
      const createResult = await whmApi.createAccount(accountData);

      if (createResult.success) {
        const result = {
          success: true,
          domain,
          username,
          password,
          email,
          message: createResult.message
        };

        processData.results.successful.push(result);
        processData.stats.successful++;
        processData.stats.processed++;

        this.processStateManager.addLog(processId, {
          level: 'info',
          message: `Account created successfully for ${domain}`,
          data: { domain, username, password, email }
        });

        return result;
      } else {
        const result = {
          success: false,
          domain,
          username,
          error: createResult.error,
          code: createResult.code
        };

        processData.results.failed.push(result);
        processData.stats.failed++;
        processData.stats.processed++;

        this.processStateManager.addLog(processId, {
          level: 'error',
          message: `Failed to create account for ${domain}: ${createResult.error}`,
          data: { domain, username, error: createResult.error }
        });

        return result;
      }

    } catch (error) {
      const result = {
        success: false,
        domain,
        error: error.message,
        code: 'PROCESSING_ERROR'
      };

      processData.results.failed.push(result);
      processData.stats.failed++;
      processData.stats.processed++;

      this.processStateManager.addLog(processId, {
        level: 'error',
        message: `Error processing domain ${domain}: ${error.message}`,
        data: { domain, error: error.message }
      });

      return result;
    }
  }

  /**
   * Update progress for a process
   */
  updateProgress(processId) {
    const processData = this.activeProcesses.get(processId);
    if (!processData) return;

    this.processStateManager.updateProgress(processId, {
      current: processData.stats.processed,
      total: processData.totalDomains,
      successful: processData.stats.successful,
      failed: processData.stats.failed,
      skipped: processData.stats.skipped
    });
  }

  /**
   * Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process promises with concurrency limit
   */
  async processWithConcurrencyLimit(promises, limit) {
    const results = [];
    const executing = [];

    for (const promise of promises) {
      const p = Promise.resolve(promise()).then(result => {
        executing.splice(executing.indexOf(p), 1);
        return result;
      });

      results.push(p);
      executing.push(p);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get process status
   */
  getProcessStatus(processId) {
    return this.activeProcesses.get(processId) || null;
  }

  /**
   * Cancel a process
   */
  cancelProcess(processId) {
    const processData = this.activeProcesses.get(processId);
    if (!processData) {
      return { success: false, error: 'Process not found' };
    }

    processData.status = 'cancelled';
    this.activeProcesses.delete(processId);

    this.processStateManager.addLog(processId, {
      level: 'warn',
      message: 'Process cancelled by user'
    });

    this.processStateManager.failProcess(processId, new Error('Process cancelled by user'));

    return { success: true, message: 'Process cancelled' };
  }

  /**
   * Get all active processes
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.values());
  }
}

module.exports = BulkCreator;