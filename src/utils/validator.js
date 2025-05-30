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

// Domain validation schema
const domainSchema = Joi.string()
  .pattern(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/)
  .required();

// Account generation request schema
const accountGenerationSchema = Joi.object({
  whmCredentials: whmCredentialsSchema.required(),
  domains: Joi.array().items(domainSchema).min(1).max(1000).required(),
  emailTemplate: Joi.string().email().optional(),
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
 * Sanitize username from domain with random suffix
 */
function sanitizeUsername(domain) {
  // Remove TLD and special characters, keep alphanumeric only
  let domainPart = domain.split('.')[0];
  domainPart = domainPart.replace(/[^a-z0-9]/gi, '');
  
  // Take only first 4 characters from domain
  let prefix = domainPart.substring(0, 4);
  
  // Ensure it starts with a letter
  if (!/^[a-z]/i.test(prefix)) {
    prefix = 'u' + prefix.substring(1);
  }
  
  // If prefix is less than 4 chars, pad with random letters
  while (prefix.length < 4) {
    const randomLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // a-z
    prefix += randomLetter;
  }
  
  // Generate random suffix (4 characters mix of letters and numbers)
  const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Combine prefix and suffix (total 8 characters for cPanel limit)
  const username = (prefix + suffix).substring(0, 8);
  
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

module.exports = {
  validateEnvVariables,
  validateWhmCredentials,
  validateDomain,
  validateDomains,
  validateAccountGenerationRequest,
  sanitizeUsername,
  generateSecurePassword,
  schemas: {
    envSchema,
    whmCredentialsSchema,
    domainSchema,
    accountGenerationSchema
  }
};