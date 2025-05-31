const Joi = require('joi');
const logger = require('./logger');

// Environment variables validation schema
const envSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  SESSION_SECRET: Joi.string().min(32),
  ENCRYPTION_KEY: Joi.string().length(32),
  RATE_LIMIT_WINDOW_MS: Joi.number().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().positive().default(100),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  MAX_CONCURRENT_ACCOUNTS: Joi.number().positive().default(5),
  REQUEST_TIMEOUT: Joi.number().positive().default(30000),
  BATCH_SIZE: Joi.number().positive().default(10)
}).unknown(true);

// WHM credentials validation schema
const whmCredentialsSchema = Joi.object({
  host: Joi.string().hostname().required(),
  port: Joi.number().port().default(2087),
  username: Joi.string().required(),
  apiToken: Joi.string().optional(),
  password: Joi.string().optional(),
  ssl: Joi.boolean().default(true)
}).custom((value, helpers) => {
  // Ensure either apiToken or password is provided
  if (!value.apiToken && !value.password) {
    return helpers.error('object.missing', { key: 'apiToken or password' });
  }
  return value;
});

// Cloudflare credentials validation schema
const cloudflareCredentialsSchema = Joi.object({
  email: Joi.string().email().required(),
  apiKey: Joi.string().required(),
  recordType: Joi.string().valid('A', 'CNAME').default('A'),
  recordValue: Joi.string().required()
});

// Domain validation schema
const domainSchema = Joi.string()
  .pattern(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/)
  .required();

// Account generation request schema
const accountGenerationSchema = Joi.object({
  whmCredentials: whmCredentialsSchema.required(),
  cloudflareCredentials: cloudflareCredentialsSchema.optional(),
  domains: Joi.array().items(domainSchema).min(1).max(1000).required(),
  emailTemplate: Joi.string().pattern(/^[a-zA-Z0-9._%+-]+@(\{domain\}|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/).optional(),
  plan: Joi.string().optional(),
  quota: Joi.alternatives().try(
    Joi.number().positive(),
    Joi.string().valid('unlimited')
  ).optional(),
  bwlimit: Joi.alternatives().try(
    Joi.number().positive(),
    Joi.string().valid('unlimited')
  ).optional(),
  maxaddons: Joi.number().integer().min(0).optional(),
  maxparked: Joi.number().integer().min(0).optional(),
  maxsubs: Joi.number().integer().min(0).optional(),
  maxsql: Joi.number().integer().min(0).optional(),
  hasshell: Joi.boolean().default(false),
  cgi: Joi.boolean().default(true)
});

/**
 * Validate environment variables
 */
function validateEnvVariables() {
  const { error, value } = envSchema.validate(process.env);
  
  if (error) {
    logger.error('Environment validation failed:', error.details);
    throw new Error(`Environment validation failed: ${error.message}`);
  }
  
  // Update process.env with validated and default values
  Object.assign(process.env, value);
  
  logger.info('Environment variables validated successfully');
  return value;
}

/**
 * Validate WHM credentials
 */
function validateWhmCredentials(credentials) {
  const { error, value } = whmCredentialsSchema.validate(credentials);
  
  if (error) {
    logger.warn('WHM credentials validation failed:', error.details);
    throw new Error(`Invalid WHM credentials: ${error.message}`);
  }
  
  return value;
}

/**
 * Validate domain format
 */
function validateDomain(domain) {
  const { error, value } = domainSchema.validate(domain);
  
  if (error) {
    return { isValid: false, error: error.message };
  }
  
  return { isValid: true, domain: value };
}

/**
 * Validate bulk domains array
 */
function validateDomains(domains) {
  const results = {
    valid: [],
    invalid: [],
    duplicates: []
  };
  
  const seen = new Set();
  
  domains.forEach((domain, index) => {
    const normalizedDomain = domain.trim().toLowerCase();
    
    if (seen.has(normalizedDomain)) {
      results.duplicates.push({ domain, index, error: 'Duplicate domain' });
      return;
    }
    
    seen.add(normalizedDomain);
    
    const validation = validateDomain(normalizedDomain);
    
    if (validation.isValid) {
      results.valid.push(normalizedDomain);
    } else {
      results.invalid.push({ 
        domain, 
        index, 
        error: validation.error 
      });
    }
  });
  
  return results;
}

/**
 * Validate account generation request
 */
function validateAccountGenerationRequest(requestData) {
  const { error, value } = accountGenerationSchema.validate(requestData);
  
  if (error) {
    logger.warn('Account generation request validation failed:', error.details);
    throw new Error(`Invalid request: ${error.message}`);
  }
  
  return value;
}

/**
 * Validate Cloudflare credentials
 */
function validateCloudflareCredentials(credentials) {
  const { error, value } = cloudflareCredentialsSchema.validate(credentials);
  
  if (error) {
    logger.warn('Cloudflare credentials validation failed:', error.details);
    throw new Error(`Invalid Cloudflare credentials: ${error.message}`);
  }
  
  return value;
}

/**
 * Generate completely random username (minimum 14 characters)
 */
function sanitizeUsername(domain) {
  // Use only random alphanumeric characters - no domain parts
  const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const letterCharset = 'abcdefghijklmnopqrstuvwxyz';
  
  let username = '';
  
  // Ensure first character is always a letter (cPanel requirement)
  username += letterCharset.charAt(Math.floor(Math.random() * letterCharset.length));
  
  // Generate remaining 13 random characters (letters and numbers)
  for (let i = 1; i < 14; i++) {
    username += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return username.toLowerCase();
}

/**
 * Generate secure password
 */
function generateSecurePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const mandatoryChars = [
    'abcdefghijklmnopqrstuvwxyz', // lowercase
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // uppercase
    '0123456789', // numbers
    '!@#$%^&*' // special chars
  ];
  
  let password = '';
  
  // Ensure at least one character from each mandatory set
  mandatoryChars.forEach(chars => {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  });
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate email from template
 */
function generateEmailFromTemplate(emailTemplate, domain) {
  if (!emailTemplate) {
    return `admin@${domain}`;
  }
  
  return emailTemplate.replace(/\{domain\}/g, domain);
}

module.exports = {
  validateEnvVariables,
  validateWhmCredentials,
  validateCloudflareCredentials,
  validateDomain,
  validateDomains,
  validateAccountGenerationRequest,
  sanitizeUsername,
  generateSecurePassword,
  generateEmailFromTemplate,
  schemas: {
    envSchema,
    whmCredentialsSchema,
    cloudflareCredentialsSchema,
    domainSchema,
    accountGenerationSchema
  }
};