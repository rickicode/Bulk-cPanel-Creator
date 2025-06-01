const axios = require('axios');
const logger = require('../utils/logger');

class CloudflareApi {
  constructor(credentials) {
    this.email = credentials.email;
    this.apiKey = credentials.apiKey;
    this.recordType = credentials.recordType || 'A';
    this.recordValue = credentials.recordValue;
    
    this.baseURL = 'https://api.cloudflare.com/client/v4';
    this.headers = {
      'X-Auth-Email': this.email,
      'X-Auth-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test Cloudflare connection
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/user`, {
        headers: this.headers,
        timeout: 30000
      });

      if (response.data.success) {
        return {
          success: true,
          data: {
            email: response.data.result.email,
            accountId: response.data.result.id
          }
        };
      } else {
        return {
          success: false,
          error: response.data.errors?.[0]?.message || 'Unknown error'
        };
      }
    } catch (error) {
      logger.error('Cloudflare connection test failed:', error.message);
      
      if (error.response) {
        const errorMessage = error.response.data?.errors?.[0]?.message || 
                           `HTTP ${error.response.status}: ${error.response.statusText}`;
        return {
          success: false,
          error: errorMessage
        };
      }
      
      return {
        success: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Extract main domain from subdomain
   * e.g., product4.thalvina.my.id -> thalvina.my.id
   */
  extractMainDomain(domain) {
    const parts = domain.split('.');
    
    // Handle different TLD structures
    if (parts.length >= 3) {
      // For domains like product.example.com or product.example.co.uk
      const lastPart = parts[parts.length - 1];
      const secondLastPart = parts[parts.length - 2];
      const thirdLastPart = parts[parts.length - 3];
      
      // Common two-part TLDs
      const twoPartTlds = ['co.uk', 'co.id', 'my.id', 'biz.id', 'web.id', 'com.au', 'co.za', 'org.uk'];
      const currentTld = `${secondLastPart}.${lastPart}`;
      
      if (twoPartTlds.includes(currentTld)) {
        // For domains like product.example.co.uk -> example.co.uk
        return `${thirdLastPart}.${currentTld}`;
      } else {
        // For domains like product.example.com -> example.com
        return `${secondLastPart}.${lastPart}`;
      }
    }
    
    // If it's already a main domain, return as is
    return domain;
  }

  /**
   * Get zone by domain name
   */
  async getZoneByDomain(domain) {
    try {
      const mainDomain = this.extractMainDomain(domain);
      
      const response = await axios.get(`${this.baseURL}/zones`, {
        headers: this.headers,
        params: {
          name: mainDomain
        },
        timeout: 30000
      });

      if (response.data.success && response.data.result.length > 0) {
        return {
          success: true,
          data: {
            zone: response.data.result[0],
            mainDomain: mainDomain
          }
        };
      } else {
        return {
          success: false,
          error: `Zone not found for domain: ${mainDomain}`
        };
      }
    } catch (error) {
      logger.error('Failed to get zone:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to get zone'
      };
    }
  }

  /**
   * Get existing DNS records for a domain
   */
  async getDnsRecords(zoneId, recordName, recordType = null) {
    try {
      const params = {
        name: recordName
      };
      
      if (recordType) {
        params.type = recordType;
      }

      const response = await axios.get(`${this.baseURL}/zones/${zoneId}/dns_records`, {
        headers: this.headers,
        params: params,
        timeout: 30000
      });

      if (response.data.success) {
        return {
          success: true,
          data: response.data.result
        };
      } else {
        return {
          success: false,
          error: response.data.errors?.[0]?.message || 'Failed to get DNS records'
        };
      }
    } catch (error) {
      logger.error('Failed to get DNS records:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to get DNS records'
      };
    }
  }

  /**
   * Delete DNS record
   */
  async deleteDnsRecord(zoneId, recordId) {
    try {
      const response = await axios.delete(`${this.baseURL}/zones/${zoneId}/dns_records/${recordId}`, {
        headers: this.headers,
        timeout: 30000
      });

      if (response.data.success) {
        return {
          success: true,
          data: response.data.result
        };
      } else {
        return {
          success: false,
          error: response.data.errors?.[0]?.message || 'Failed to delete DNS record'
        };
      }
    } catch (error) {
      logger.error('Failed to delete DNS record:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to delete DNS record'
      };
    }
  }

  /**
   * Create DNS record
   */
  async createDnsRecord(zoneId, recordData) {
    try {
      const response = await axios.post(`${this.baseURL}/zones/${zoneId}/dns_records`, recordData, {
        headers: this.headers,
        timeout: 30000
      });

      if (response.data.success) {
        return {
          success: true,
          data: response.data.result
        };
      } else {
        return {
          success: false,
          error: response.data.errors?.[0]?.message || 'Failed to create DNS record'
        };
      }
    } catch (error) {
      logger.error('Failed to create DNS record:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to create DNS record'
      };
    }
  }

  /**
   * Add or update DNS record for a domain
   */
  async addOrUpdateDnsRecord(domain) {
    try {
      // Get the zone for the main domain
      const zoneResult = await this.getZoneByDomain(domain);
      if (!zoneResult.success) {
        return zoneResult;
      }

      const zone = zoneResult.data.zone;
      const mainDomain = zoneResult.data.mainDomain;
      
      // Determine the record name
      let recordName = domain;
      if (domain === mainDomain) {
        // If it's the main domain, use '@' or the domain itself
        recordName = domain;
      }

      // Check for existing records
      logger.info(`Checking for existing DNS records for ${recordName}...`);
      const existingRecords = await this.getDnsRecords(zone.id, recordName, this.recordType);
      if (!existingRecords.success) {
        logger.warn(`Could not check existing records for ${recordName}: ${existingRecords.error}`);
      }

      // Delete existing records if any
      if (existingRecords.success && existingRecords.data.length > 0) {
        logger.warn(`⚠️  Found ${existingRecords.data.length} existing ${this.recordType} record(s) for ${recordName}:`);
        
        for (const record of existingRecords.data) {
          logger.info(`   - Record ID: ${record.id}, Content: ${record.content}, Proxied: ${record.proxied ? 'Yes' : 'No'}, TTL: ${record.ttl}`);
          
          const deleteResult = await this.deleteDnsRecord(zone.id, record.id);
          if (!deleteResult.success) {
            logger.error(`❌ Failed to delete existing record ${record.id}: ${deleteResult.error}`);
          } else {
            logger.info(`🗑️  Deleted existing ${this.recordType} record: ${recordName} -> ${record.content} (ID: ${record.id})`);
          }
        }
        
        logger.info(`✅ Cleared ${existingRecords.data.length} existing record(s) for ${recordName}`);
      } else {
        logger.info(`✓ No existing records found for ${recordName}, proceeding with creation`);
      }

      // Create the new record
      const recordData = {
        type: this.recordType,
        name: recordName,
        content: this.recordValue,
        ttl: 300, // 5 minutes
        proxied: true // Default to proxied (orange cloud) instead of direct (gray cloud)
      };

      logger.info(`Creating new ${this.recordType} record: ${recordName} -> ${this.recordValue} (Proxied: Yes, TTL: 300s)`);
      const createResult = await this.createDnsRecord(zone.id, recordData);
      if (createResult.success) {
        logger.info(`✅ Successfully created ${this.recordType} record for ${recordName} -> ${this.recordValue} (ID: ${createResult.data.id}, Proxied: ${createResult.data.proxied ? 'Yes' : 'No'})`);
        return {
          success: true,
          data: {
            record: createResult.data,
            zone: zone,
            action: existingRecords.success && existingRecords.data.length > 0 ? 'replaced' : 'created'
          }
        };
      } else {
        logger.error(`❌ Failed to create ${this.recordType} record for ${recordName}: ${createResult.error}`);
        return createResult;
      }

    } catch (error) {
      logger.error(`Failed to add/update DNS record for ${domain}:`, error.message);
      return {
        success: false,
        error: error.message || 'Failed to add/update DNS record'
      };
    }
  }
}

module.exports = CloudflareApi;