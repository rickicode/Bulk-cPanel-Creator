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
   * e.g., shopone.ethwan.in.net -> ethwan.in.net
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
      const twoPartTlds = ['co.uk', 'co.id', 'my.id', 'biz.id', 'in.net', 'web.id', 'com.au', 'co.za', 'org.uk'];
      const currentTld = `${secondLastPart}.${lastPart}`;
      
      if (twoPartTlds.includes(currentTld)) {
        if (parts.length >= 4) {
          // For domains like shopone.ethwan.in.net -> ethwan.in.net
          return `${thirdLastPart}.${currentTld}`;
        } else {
          // For domains like ethwan.in.net -> ethwan.in.net (already main domain)
          return domain;
        }
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
        // Check if we have access to any zones at all to provide better error message
        const allZonesResponse = await axios.get(`${this.baseURL}/zones`, {
          headers: this.headers,
          params: { per_page: 5 }, // Just get a few to check access
          timeout: 30000
        });

        let errorMessage = `Domain '${mainDomain}' not found in Cloudflare account`;
        
        if (allZonesResponse.data.success && allZonesResponse.data.result.length > 0) {
          const availableDomains = allZonesResponse.data.result.map(zone => zone.name).slice(0, 3);
          errorMessage += `. Available domains: ${availableDomains.join(', ')}${allZonesResponse.data.result.length > 3 ? '...' : ''}`;
        } else {
          errorMessage += '. No domains found in this Cloudflare account or insufficient permissions.';
        }

        return {
          success: false,
          error: errorMessage,
          code: 'DOMAIN_NOT_IN_CLOUDFLARE'
        };
      }
    } catch (error) {
      logger.error('Failed to get zone:', error.message);
      
      let errorMessage = 'Failed to connect to Cloudflare';
      if (error.response) {
        if (error.response.status === 403) {
          errorMessage = 'Cloudflare API access denied. Check your API key permissions.';
        } else if (error.response.status === 401) {
          errorMessage = 'Cloudflare API authentication failed. Check your email and API key.';
        } else {
          errorMessage = `Cloudflare API error: ${error.response.status} ${error.response.statusText}`;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        code: 'CLOUDFLARE_API_ERROR'
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
      logger.info(`Attempting to create DNS record:`, JSON.stringify(recordData, null, 2));
      
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
        const errorDetails = response.data.errors || [];
        const errorMessage = errorDetails.map(err => `${err.code}: ${err.message}`).join(', ') || 'Failed to create DNS record';
        logger.error(`Cloudflare API error response:`, JSON.stringify(response.data, null, 2));
        
        return {
          success: false,
          error: errorMessage,
          details: errorDetails
        };
      }
    } catch (error) {
      logger.error('Failed to create DNS record:', error.message);
      
      if (error.response) {
        logger.error('Error response data:', JSON.stringify(error.response.data, null, 2));
        const errorMessage = error.response.data?.errors?.[0]?.message ||
                           `HTTP ${error.response.status}: ${error.response.statusText}`;
        return {
          success: false,
          error: errorMessage,
          httpStatus: error.response.status,
          details: error.response.data
        };
      }
      
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
      logger.info(`🔍 Processing DNS record for domain: ${domain}`);
      
      // Get the zone for the main domain
      const zoneResult = await this.getZoneByDomain(domain);
      if (!zoneResult.success) {
        logger.error(`❌ Zone lookup failed for ${domain}: ${zoneResult.error}`);
        // Return more specific error for domain not found in Cloudflare
        return {
          success: false,
          error: zoneResult.error,
          code: zoneResult.code || 'ZONE_NOT_FOUND'
        };
      }

      const zone = zoneResult.data.zone;
      const mainDomain = zoneResult.data.mainDomain;
      
      logger.info(`✅ Found zone for main domain: ${mainDomain} (Zone ID: ${zone.id})`);
      
      // Determine the record name
      let recordName = domain;
      if (domain === mainDomain) {
        // If it's the main domain, use '@' or the domain itself
        recordName = domain;
        logger.info(`📍 Using main domain as record name: ${recordName}`);
      } else {
        logger.info(`📍 Using subdomain as record name: ${recordName}`);
      }

      // Validate record data before proceeding
      if (!this.recordValue || this.recordValue.trim() === '') {
        const error = `Record value is empty or invalid: "${this.recordValue}"`;
        logger.error(`❌ ${error}`);
        return {
          success: false,
          error: error,
          code: 'INVALID_RECORD_VALUE'
        };
      }

      // Check for existing records (including all types to handle A/CNAME conflicts)
      logger.info(`🔍 Checking for existing DNS records for ${recordName}...`);
      const existingRecords = await this.getDnsRecords(zone.id, recordName); // Check all types
      if (!existingRecords.success) {
        logger.warn(`⚠️ Could not check existing records for ${recordName}: ${existingRecords.error}`);
      }

      // Delete existing records if any (including conflicting types)
      if (existingRecords.success && existingRecords.data.length > 0) {
        logger.warn(`⚠️  Found ${existingRecords.data.length} existing DNS record(s) for ${recordName}:`);
        
        let hasConflictingTypes = false;
        for (const record of existingRecords.data) {
          logger.info(`   - Record ID: ${record.id}, Type: ${record.type}, Content: ${record.content}, Proxied: ${record.proxied ? 'Yes' : 'No'}, TTL: ${record.ttl}`);
          
          // Check for A/CNAME conflicts
          if ((this.recordType === 'A' && record.type === 'CNAME') ||
              (this.recordType === 'CNAME' && record.type === 'A')) {
            hasConflictingTypes = true;
            logger.warn(`⚠️  Conflict detected: Trying to create ${this.recordType} but ${record.type} exists for ${recordName}`);
          }
          
          const deleteResult = await this.deleteDnsRecord(zone.id, record.id);
          if (!deleteResult.success) {
            logger.error(`❌ Failed to delete existing ${record.type} record ${record.id}: ${deleteResult.error}`);
          } else {
            logger.info(`🗑️  Deleted existing ${record.type} record: ${recordName} -> ${record.content} (ID: ${record.id})`);
          }
        }
        
        if (hasConflictingTypes) {
          logger.info(`🔄 Resolved A/CNAME conflict for ${recordName} by removing conflicting records`);
        }
        
        logger.info(`✅ Cleared ${existingRecords.data.length} existing record(s) for ${recordName}`);
      } else {
        logger.info(`✓ No existing records found for ${recordName}, proceeding with creation`);
      }

      // Create the new record
      const recordData = {
        type: this.recordType,
        name: recordName,
        content: this.recordValue.trim(),
        ttl: 300, // 5 minutes
        proxied: this.recordType === 'A' ? true : false // Only proxy A records, not CNAME
      };

      logger.info(`🚀 Creating new ${this.recordType} record: ${recordName} -> ${this.recordValue} (Proxied: ${recordData.proxied ? 'Yes' : 'No'}, TTL: 300s)`);
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
        return {
          success: false,
          error: createResult.error,
          code: 'DNS_CREATE_FAILED',
          details: createResult.details
        };
      }

    } catch (error) {
      logger.error(`❌ Failed to add/update DNS record for ${domain}:`, error.message);
      return {
        success: false,
        error: error.message || 'Failed to add/update DNS record',
        code: 'DNS_OPERATION_ERROR'
      };
    }
  }
}

module.exports = CloudflareApi;