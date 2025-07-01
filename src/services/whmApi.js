const axios = require('axios');
const https = require('https');
const tls = require('tls');
const logger = require('../utils/logger');
const { validateWhmCredentials } = require('../utils/validator');

class WHMApi {
  constructor(credentials) {
    this.credentials = validateWhmCredentials(credentials);
    this.baseURL = `${this.credentials.ssl ? 'https' : 'http'}://${this.credentials.host}:${this.credentials.port}`;
    this.timeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
    
    // Create axios instance with custom configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'cPanel-Bulk-Creator/1.0'
      },
      // Allow self-signed certificates for development
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        checkServerIdentity: (hostname, cert) => {
          const error = tls.checkServerIdentity(hostname, cert);
          if (error) {
            logger.warn(`Bypassing SSL certificate hostname validation for ${hostname}. Error: ${error.message}`);
            return undefined; // Bypass the error
          }
          return undefined; // Success
        },
      })
    });

    // Setup authentication
    this.setupAuthentication();
    
    logger.info('WHM API client initialized', {
      host: this.credentials.host,
      port: this.credentials.port,
      ssl: this.credentials.ssl
    });
  }

  /**
   * Setup authentication headers
   */
  setupAuthentication() {
    if (this.credentials.apiToken) {
      // Use API Token authentication
      this.client.defaults.headers.common['Authorization'] = `WHM ${this.credentials.username}:${this.credentials.apiToken}`;
    } else if (this.credentials.password) {
      // Use Basic authentication
      const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
      this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
    } else {
      throw new Error('Either API token or password must be provided');
    }
  }

  /**
   * Test connection to WHM server
   */
  async testConnection() {
    try {
      logger.debug('Testing WHM connection...');
      
      const response = await this.client.get('/json-api/version');
      
      if (response.status === 200 && response.data) {
        logger.info('WHM connection successful', {
          version: response.data.version,
          build: response.data.build
        });
        
        return {
          success: true,
          version: response.data.version,
          build: response.data.build,
          message: 'Connection successful'
        };
      } else {
        throw new Error('Invalid response from WHM server');
      }
    } catch (error) {
      logger.error('WHM connection failed:', {
        error: error.message,
        code: error.code,
        response: error.response?.data
      });
      
      return {
        success: false,
        error: error.message,
        code: error.code || 'CONNECTION_FAILED'
      };
    }
  }

  /**
   * Get available packages/plans
   */
  async getPackages() {
    try {
      logger.debug('Fetching WHM packages...');
      
      const response = await this.client.get('/json-api/listpkgs');
      
      if (response.data && response.data.package) {
        const packages = response.data.package.map(pkg => ({
          name: pkg.name,
          quota: pkg.QUOTA,
          bwlimit: pkg.BWLIMIT,
          maxaddons: pkg.MAXADDON,
          maxparked: pkg.MAXPARKED,
          maxsubs: pkg.MAXSUB,
          maxsql: pkg.MAXSQL
        }));
        
        logger.debug(`Found ${packages.length} packages`);
        return { success: true, packages };
      } else {
        throw new Error('Invalid packages response');
      }
    } catch (error) {
      logger.error('Failed to fetch packages:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new cPanel account
   */
  async createAccount(accountData) {
    try {
      const {
        domain,
        username,
        password,
        email,
        plan,
        quota,
        bwlimit,
        maxaddons,
        maxparked,
        maxsubs,
        maxsql,
        hasshell,
        cgi
      } = accountData;

      logger.debug('Creating cPanel account', { domain, username });

      // Prepare request parameters
      const params = new URLSearchParams({
        domain: domain,
        username: username,
        password: password,
        ...(email && { contactemail: email }),
        ...(plan && { plan: plan }),
        ...(quota && { quota: quota }),
        ...(bwlimit && { bwlimit: bwlimit }),
        ...(maxaddons !== undefined && { maxaddon: maxaddons }),
        ...(maxparked !== undefined && { maxparked: maxparked }),
        ...(maxsubs !== undefined && { maxsub: maxsubs }),
        ...(maxsql !== undefined && { maxsql: maxsql }),
        ...(hasshell !== undefined && { hasshell: hasshell ? 1 : 0 }),
        ...(cgi !== undefined && { cgi: cgi ? 1 : 0 }),
        // Additional default parameters
        savepkg: 0, // Don't save as package
        featurelist: 'default', // Use default feature list
        maxftp: 'unlimited',
        maxlst: 'unlimited'
      });

      const response = await this.client.post('/json-api/createacct', params);

      if (response.data) {
        if (response.data.result && response.data.result[0] && response.data.result[0].status === 1) {
          // Success
          const result = response.data.result[0];
          logger.info('Account created successfully', { 
            domain, 
            username,
            message: result.statusmsg 
          });
          
          return {
            success: true,
            domain: domain,
            username: username,
            message: result.statusmsg,
            rawOutput: result.rawout
          };
        } else {
          // API returned error
          const error = response.data.result?.[0]?.statusmsg || 
                       response.data.error || 
                       'Unknown error from WHM API';
          
          logger.warn('Account creation failed', { domain, username, error });
          
          return {
            success: false,
            domain: domain,
            username: username,
            error: error,
            code: 'WHM_API_ERROR'
          };
        }
      } else {
        throw new Error('Invalid response from WHM API');
      }
    } catch (error) {
      logger.error('Account creation error:', {
        domain: accountData.domain,
        username: accountData.username,
        error: error.message,
        code: error.code
      });

      return {
        success: false,
        domain: accountData.domain,
        username: accountData.username,
        error: error.message,
        code: error.code || 'REQUEST_FAILED'
      };
    }
  }

  /**
   * Check if domain already exists
   */
  async checkDomainExists(domain) {
    try {
      logger.debug('Checking if domain exists', { domain });
      
      const response = await this.client.get('/json-api/listaccts');
      
      if (response.data && response.data.acct) {
        // More detailed logging for debugging
        logger.debug(`Checking domain ${domain} against ${response.data.acct.length} existing accounts`);
        
        const exists = response.data.acct.some(account => {
          // Check main domain (exact match)
          if (account.domain === domain) {
            logger.debug(`Domain ${domain} found as main domain for account ${account.user}`);
            return true;
          }
          
          // Check addon domains (exact match)
          if (account.addon_domains && Array.isArray(account.addon_domains)) {
            if (account.addon_domains.includes(domain)) {
              logger.debug(`Domain ${domain} found in addon domains for account ${account.user}`);
              return true;
            }
          } else if (account.addon_domains && typeof account.addon_domains === 'string') {
            // Handle case where addon_domains is a string (comma-separated)
            const addonList = account.addon_domains.split(',').map(d => d.trim());
            if (addonList.includes(domain)) {
              logger.debug(`Domain ${domain} found in addon domains (string) for account ${account.user}`);
              return true;
            }
          }
          
          // Check parked domains (exact match)
          if (account.parked_domains && Array.isArray(account.parked_domains)) {
            if (account.parked_domains.includes(domain)) {
              logger.debug(`Domain ${domain} found in parked domains for account ${account.user}`);
              return true;
            }
          } else if (account.parked_domains && typeof account.parked_domains === 'string') {
            // Handle case where parked_domains is a string (comma-separated)
            const parkedList = account.parked_domains.split(',').map(d => d.trim());
            if (parkedList.includes(domain)) {
              logger.debug(`Domain ${domain} found in parked domains (string) for account ${account.user}`);
              return true;
            }
          }
          
          // Check subdomains (exact match)
          if (account.sub_domains && Array.isArray(account.sub_domains)) {
            if (account.sub_domains.includes(domain)) {
              logger.debug(`Domain ${domain} found in subdomains for account ${account.user}`);
              return true;
            }
          } else if (account.sub_domains && typeof account.sub_domains === 'string') {
            // Handle case where sub_domains is a string (comma-separated)
            const subList = account.sub_domains.split(',').map(d => d.trim());
            if (subList.includes(domain)) {
              logger.debug(`Domain ${domain} found in subdomains (string) for account ${account.user}`);
              return true;
            }
          }
          
          return false;
        });
        
        logger.debug('Domain existence check completed', { domain, exists });
        
        // Additional debug logging for the specific domain
        if (domain === 'shopone.ethwan.in.net') {
          logger.info(`🔍 Detailed check for ${domain}:`, {
            domain,
            exists,
            totalAccounts: response.data.acct.length,
            accountDomains: response.data.acct.map(acc => ({
              user: acc.user,
              domain: acc.domain,
              addon_domains: acc.addon_domains,
              parked_domains: acc.parked_domains,
              sub_domains: acc.sub_domains
            })).slice(0, 5) // Show first 5 accounts for debugging
          });
        }
        
        return { success: true, exists };
      } else {
        throw new Error('Invalid accounts list response');
      }
    } catch (error) {
      logger.error('Domain existence check failed:', {
        domain,
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Get server statistics
   */
  async getServerStats() {
    try {
      const response = await this.client.get('/json-api/loadavg');
      
      if (response.data) {
        return {
          success: true,
          stats: {
            loadavg: response.data.one,
            uptime: response.data.uptime,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        throw new Error('Invalid server stats response');
      }
    } catch (error) {
      logger.error('Failed to get server stats:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all accounts
   */
  async listAccounts(searchTerm = null) {
    try {
      const params = searchTerm ? { search: searchTerm, searchtype: 'domain' } : {};
      const response = await this.client.get('/json-api/listaccts', { params });

      if (response.data && Array.isArray(response.data.acct)) {
        const accounts = response.data.acct.map(account => ({
          domain: account.domain,
          username: account.user,
          email: account.email,
          plan: account.plan,
          suspended: account.suspended === '1',
          created: account.startdate
        }));
        return { success: true, accounts };
      } else {
        logger.warn('WHM API returned unexpected accounts list structure', { data: response.data });
        // Treat as no accounts found instead of error
        return { success: true, accounts: [] };
      }
    } catch (error) {
      logger.error('Failed to list accounts:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(username) {
    try {
      logger.debug('Getting account info', { username });
      
      const response = await this.client.get('/json-api/accountsummary', {
        params: { user: username }
      });
      
      if (response.data && response.data.acct && response.data.acct.length > 0) {
        const account = response.data.acct[0];
        return {
          success: true,
          user: account.user,
          domain: account.domain,
          email: account.email,
          plan: account.plan,
          suspended: account.suspended === '1',
          created: account.startdate,
          diskused: account.diskused,
          disklimit: account.disklimit
        };
      } else {
        // Try alternative method - list all accounts and find the specific one
        const listResponse = await this.client.get('/json-api/listaccts', {
          params: { search: username, searchtype: 'user' }
        });
        
        if (listResponse.data && listResponse.data.acct && listResponse.data.acct.length > 0) {
          const account = listResponse.data.acct[0];
          return {
            success: true,
            user: account.user,
            domain: account.domain,
            email: account.email,
            plan: account.plan,
            suspended: account.suspended === '1',
            created: account.startdate
          };
        } else {
          return { success: false, error: 'Account not found' };
        }
      }
    } catch (error) {
      logger.error('Failed to get account info:', {
        username,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete cPanel account
   */
  async deleteAccount(username) {
    try {
      logger.info('Deleting account', { username });
      
      const response = await this.client.get('/json-api/removeacct', {
        params: { user: username }
      });
      
      if (response.data) {
        if (response.data.result && response.data.result[0] && response.data.result[0].status === 1) {
          logger.info('Account deleted successfully', { username });
          return {
            success: true,
            message: response.data.result[0].statusmsg || 'Account deleted successfully'
          };
        } else {
          const errorMsg = response.data.result && response.data.result[0] ?
            response.data.result[0].statusmsg : 'Unknown deletion error';
          throw new Error(errorMsg);
        }
      } else {
        throw new Error('Invalid response from WHM API');
      }
    } catch (error) {
      logger.error('Account deletion failed:', {
        username,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Terminate a cPanel account by its domain name.
   */
  async terminateAccountByDomain(domain) {
    try {
      logger.info('Attempting to terminate account by domain', { domain });
      
      // Find the user for the domain
      const accountList = await this.listAccounts(domain);
      if (!accountList.success || accountList.accounts.length === 0) {
        logger.warn('No account found for domain, skipping termination.', { domain });
        return { success: true, message: 'Account did not exist, no termination needed.' };
      }
      
      const account = accountList.accounts.find(acc => acc.domain === domain);
      if (!account) {
        logger.warn('Domain search returned accounts, but none matched exactly. Skipping termination.', { domain });
        return { success: true, message: 'No exact account match found, no termination needed.' };
      }

      const username = account.username;
      logger.info(`Found user "${username}" for domain "${domain}". Proceeding with termination.`);
      
      // Terminate the account using the found username
      return await this.deleteAccount(username);

    } catch (error) {
      logger.error('Failed to terminate account by domain:', {
        domain,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get account information by domain name.
   */
  async getAccountInfoByDomain(domain) {
    try {
      const accountList = await this.listAccounts(domain);
      if (!accountList.success) {
        // If the error is about invalid accounts list, treat as no account found
        if (
          accountList.error &&
          accountList.error.toLowerCase().includes('invalid accounts list')
        ) {
          logger.warn('WHM API returned invalid accounts list, treating as no account found', { domain });
          return { success: true, account: null };
        }
        throw new Error(accountList.error);
      }
      if (!Array.isArray(accountList.accounts) || accountList.accounts.length === 0) {
        return { success: true, account: null }; // No account found
      }
      const account = accountList.accounts.find(acc => acc.domain === domain);
      if (!account) {
        return { success: true, account: null }; // No exact match
      }
      return { success: true, account };
    } catch (error) {
      logger.error('Failed to get account info by domain:', {
        domain,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

module.exports = WHMApi;
