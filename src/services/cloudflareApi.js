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
      const twoPartTlds = [
        'co.uk', 'co.id', 'my.id', 'biz.id', 'in.net', 'web.id', 'com.au', 'co.za', 'org.uk',
        'ac.id', 'sch.id', 'or.id', 'net.id', 'go.id', 'mil.id', 'ac.uk', 'gov.uk', 'ltd.uk',
        'plc.uk', 'me.uk', 'net.uk', 'org.za', 'com.sg', 'com.my', 'com.br', 'com.tr', 'com.sa',
        'com.mx', 'com.ph', 'com.hk', 'com.tw', 'com.cn', 'com.ru', 'com.pl', 'com.ar', 'com.co',
        'com.pe', 'com.ec', 'com.ve', 'com.uy', 'com.bo', 'com.py', 'com.do', 'com.gt', 'com.ni',
        'com.pa', 'com.cr', 'com.sv', 'com.hn', 'com.cu', 'com.jo', 'com.lb', 'com.eg', 'com.qa',
        'com.om', 'com.kw', 'com.bh', 'com.pk', 'com.bd', 'com.lk', 'com.mm', 'com.kh', 'com.vn',
        'com.th', 'com.sg', 'com.my', 'com.au', 'com.nz', 'com.za', 'co.jp', 'co.kr', 'co.th',
        'co.in', 'co.il', 'co.nz', 'co.ke', 'co.tz', 'co.ug', 'co.zm', 'co.zw', 'co.mz', 'co.bw',
        'co.na', 'co.sz', 'co.ls', 'co.mw', 'co.cm', 'co.ao', 'co.ci', 'co.sn', 'co.ma', 'co.tn',
        'co.dz', 'co.eg', 'co.sd', 'co.ly', 'co.gh', 'co.ng', 'co.sl', 'co.lr', 'co.gm', 'co.bj',
        'co.tg', 'co.ne', 'co.ml', 'co.bf', 'co.cg', 'co.ga', 'co.gq', 'co.st', 'co.cv', 'co.gw',
        // European domains
        'com.de', 'com.fr', 'com.es', 'com.it', 'com.pt', 'com.nl', 'com.be', 'com.at', 'com.ch',
        'com.se', 'com.no', 'com.dk', 'com.fi', 'com.ie', 'com.gr', 'com.cz', 'com.hu', 'com.ro',
        'com.bg', 'com.hr', 'com.si', 'com.sk', 'com.lt', 'com.lv', 'com.ee', 'com.mt', 'com.cy',
        'com.lu', 'com.mc', 'com.ad', 'com.sm', 'com.va', 'com.li', 'co.rs', 'co.me', 'co.ba',
        'co.mk', 'co.al', 'co.md', 'co.ua', 'co.by', 'co.ge', 'co.am', 'co.az',
        // Asian domains
        'com.in', 'com.jp', 'com.kr', 'com.np', 'com.bt', 'com.af', 'com.ir', 'com.iq', 'com.sy',
        'com.ye', 'com.ae', 'com.il', 'com.ps', 'com.uz', 'com.tm', 'com.tj', 'com.kg', 'com.kz',
        'com.mn', 'com.la', 'com.bn', 'com.mv', 'com.fj', 'com.to', 'com.ws', 'com.tv', 'com.vu',
        'com.sb', 'com.pg', 'com.nc', 'com.ki', 'com.nr', 'com.pw', 'com.fm', 'com.mh', 'com.ck',
        // American domains
        'com.ca', 'com.us', 'com.pr', 'com.vi', 'com.ag', 'com.ai', 'com.aw', 'com.bb', 'com.bm',
        'com.bs', 'com.bz', 'com.dm', 'com.gd', 'com.gy', 'com.jm', 'com.kn', 'com.ky', 'com.lc',
        'com.ms', 'com.tc', 'com.tt', 'com.vc', 'com.vg', 'com.sr', 'com.gf', 'com.gl', 'com.fk',
        // African domains
        'com.dz', 'com.ao', 'com.bj', 'com.bw', 'com.bf', 'com.bi', 'com.cm', 'com.cv', 'com.cf',
        'com.td', 'com.km', 'com.cd', 'com.cg', 'com.ci', 'com.dj', 'com.gq', 'com.er', 'com.et',
        'com.ga', 'com.gm', 'com.gh', 'com.gn', 'com.gw', 'com.ke', 'com.ls', 'com.lr', 'com.ly',
        'com.mg', 'com.mw', 'com.ml', 'com.mr', 'com.mu', 'com.ma', 'com.mz', 'com.na', 'com.ne',
        'com.ng', 'com.rw', 'com.st', 'com.sn', 'com.sc', 'com.sl', 'com.so', 'com.za', 'com.ss',
        'com.sd', 'com.sz', 'com.tz', 'com.tg', 'com.tn', 'com.ug', 'com.eh', 'com.zm', 'com.zw',
        // Other common two-part TLDs
        'org.au', 'net.au', 'edu.au', 'gov.au', 'asn.au', 'id.au', 'org.za', 'net.za', 'edu.za',
        'gov.za', 'mil.za', 'nom.za', 'ac.za', 'org.uk', 'net.uk', 'gov.uk', 'mod.uk', 'nhs.uk',
        'police.uk', 'sch.uk', 'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'ad.jp', 'ed.jp', 'go.jp',
        'gr.jp', 'lg.jp', 'org.in', 'net.in', 'edu.in', 'nic.in', 'ac.in', 'co.in', 'firm.in',
        'gen.in', 'ind.in', 'mil.in', 'res.in'
      ];
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
        // Return more specific error for domain not found in Cloudflare
        return {
          success: false,
          error: zoneResult.error,
          code: zoneResult.code || 'ZONE_NOT_FOUND'
        };
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
        return {
          success: false,
          error: createResult.error,
          code: 'DNS_CREATE_FAILED'
        };
      }

    } catch (error) {
      logger.error(`Failed to add/update DNS record for ${domain}:`, error.message);
      return {
        success: false,
        error: error.message || 'Failed to add/update DNS record',
        code: 'DNS_OPERATION_ERROR'
      };
    }
  }
}

module.exports = CloudflareApi;