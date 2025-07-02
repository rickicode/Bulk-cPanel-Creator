# 📚 API Documentation - cPanel Bulk Creator

Complete API reference for the cPanel Bulk Creator application.

## 🌐 Base URL

```
http://localhost:3000/api
```

## 🔐 Authentication

The API uses session-based authentication for the web interface and accepts WHM credentials in request bodies for API operations.

## 📊 Response Format

All API responses follow this standard format:

```json
{
  "success": true|false,
  "data": {}, // Present on success
  "error": "Error message", // Present on failure
  "code": "ERROR_CODE" // Present on failure
}
```

## 🛠️ Endpoints

### WHM Management

#### Test WHM Connection
```http
POST /api/whm/validate
Content-Type: application/json

{
  "whmCredentials": {
    "host": "your-server.com",
    "port": 2087,
    "username": "root",
    "apiToken": "your-api-token",
    "ssl": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "11.110.0.15",
    "build": "20231201",
    "host": "your-server.com",
    "username": "root"
  }
}
```

#### Get Available Packages
```http
GET /api/whm/packages?whmCredentials={"host":"server.com","username":"root","apiToken":"token"}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "default",
      "quota": "unlimited",
      "bwlimit": "unlimited",
      "maxaddons": "unlimited",
      "maxparked": "unlimited",
      "maxsubs": "unlimited",
      "maxsql": "unlimited"
    }
  ]
}
```

#### Get Server Statistics
```http
GET /api/whm/stats?whmCredentials={"host":"server.com","username":"root","apiToken":"token"}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "loadavg": "0.5",
    "uptime": "15 days",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### List Accounts
```http
GET /api/whm/accounts?whmCredentials={"host":"server.com","username":"root","apiToken":"token"}&search=example.com
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "domain": "example.com",
      "username": "example",
      "email": "admin@example.com",
      "plan": "default",
      "suspended": false,
      "created": "2024-01-01"
    }
  ],
  "count": 1
}
```

### Bulk Operations

#### Start Bulk Account Creation
```http
POST /api/bulk/create
Content-Type: application/json

{
  "whmCredentials": {
    "host": "your-server.com",
    "port": 2087,
    "username": "root",
    "apiToken": "your-api-token",
    "ssl": true
  },
  "domains": [
    "example1.com",
    "example2.com",
    "example3.com"
  ],
  "emailTemplate": "admin@{domain}",
  "plan": "default",
  "quota": "unlimited",
  "bwlimit": "unlimited",
  "maxaddons": 0,
  "maxparked": 0,
  "maxsubs": 0,
  "maxsql": 0,
  "hasshell": false,
  "cgi": true
}
```

**Response:**
```json
{
  "success": true,
  "processId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Bulk account creation started",
  "totalDomains": 3,
  "invalidDomains": 0,
  "duplicateDomains": 0
}
```

#### Validate Domains (GET)
```http
GET /api/bulk/validate-domains?domains=["example1.com","example2.com","invalid-domain"]
```

#### Validate Domains (POST)
```http
POST /api/bulk/validate-domains
Content-Type: application/json

{
  "domains": [
    "example1.com",
    "example2.com",
    "invalid-domain"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 3,
    "valid": ["example1.com", "example2.com"],
    "invalid": [
      {
        "domain": "invalid-domain",
        "index": 2,
        "error": "Invalid domain format"
      }
    ],
    "duplicates": [],
    "summary": {
      "validCount": 2,
      "invalidCount": 1,
      "duplicateCount": 0
    }
  }
}
```

#### Get Bulk Template
```http
GET /api/bulk/template?format=csv
```

**Response:** CSV file download

```http
GET /api/bulk/template?format=json
```

**Response:**
```json
{
  "success": true,
  "template": {
    "whmCredentials": {
      "host": "your-whm-server.com",
      "port": 2087,
      "username": "root",
      "apiToken": "your-api-token-here",
      "ssl": true
    },
    "domains": ["example1.com", "example2.com"],
    "emailTemplate": "admin@{domain}",
    "plan": "default"
  }
}
```

### Process Management

#### Get Process Status
```http
GET /api/process/{processId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processId": "550e8400-e29b-41d4-a716-446655440000",
    "totalDomains": 10,
    "status": "running",
    "startedAt": "2024-01-01T00:00:00.000Z",
    "results": {
      "successful": [],
      "failed": [],
      "skipped": []
    },
    "stats": {
      "processed": 5,
      "successful": 3,
      "failed": 1,
      "skipped": 1
    }
  }
}
```

#### Cancel Process
```http
DELETE /api/process/{processId}
```

**Response:**
```json
{
  "success": true,
  "message": "Process cancelled successfully",
  "processId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Get All Active Processes
```http
GET /api/process
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "processId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "running",
      "totalDomains": 10,
      "startedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

#### Export Process Results
```http
GET /api/process/{processId}/export?format=csv
GET /api/process/{processId}/export?format=json
GET /api/process/{processId}/export?format=txt
```

**Response:** File download in requested format

#### Get Process Logs
```http
GET /api/process/{processId}/logs
```

**Response:**
```json
{
  "success": true,
  "message": "Log retrieval not implemented yet",
  "processId": "550e8400-e29b-41d4-a716-446655440000",
  "data": []
}
```

### System

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 50331648,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1048576
  },
  "version": "1.0.0"
}
```

#### API Information
```http
GET /api
```

**Response:**
```json
{
  "name": "cPanel Bulk Creator API",
  "version": "1.0.0",
  "description": "API for bulk cPanel account creation through WHM",
  "endpoints": {
    "whm": {
      "POST /api/whm/validate": "Validate WHM credentials",
      "GET /api/whm/packages": "Get available packages"
    },
    "bulk": {
      "POST /api/bulk/create": "Start bulk account creation"
    }
  }
}
```

## 🔌 WebSocket Events

### Connection
```javascript
const socket = io();

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Subscribe to Process
```javascript
socket.emit('subscribe-process', processId);
```

### Events

#### Connection Events
```javascript
socket.on('connected', (data) => {
  // { clientId, timestamp, message }
});

socket.on('disconnect', (reason) => {
  // Connection lost
});
```

#### Process Events
```javascript
socket.on('process-started', (data) => {
  // { processId, type, totalDomains, timestamp }
});

socket.on('process-completed', (data) => {
  // { processId, duration, successful, failed, skipped }
});

socket.on('process-failed', (data) => {
  // { processId, error: { message, code } }
});
```

#### Progress Events
```javascript
socket.on('progress', (data) => {
  // {
  //   processId,
  //   current: 5,
  //   total: 10,
  //   percentage: 50,
  //   successful: 3,
  //   failed: 1,
  //   skipped: 1
  // }
});
```

#### Log Events
```javascript
socket.on('log', (data) => {
  // {
  //   processId,
  //   timestamp,
  //   level: 'info|warn|error|debug',
  //   message: 'Log message',
  //   data: {}
  // }
});
```

#### Health Events
```javascript
socket.on('pong', (data) => {
  // { timestamp }
});

// Send ping
socket.emit('ping');
```

## ❌ Error Codes

### Validation Errors
- `MISSING_CREDENTIALS` - WHM credentials not provided
- `INVALID_CREDENTIALS_FORMAT` - Credentials format invalid
- `MISSING_DOMAINS` - Domain list not provided
- `INVALID_DOMAINS_TYPE` - Domains must be array or string
- `VALIDATION_ERROR` - General validation error

### WHM Errors
- `CONNECTION_FAILED` - Cannot connect to WHM server
- `VALIDATION_FAILED` - WHM credentials invalid
- `WHM_API_ERROR` - WHM API returned error
- `PACKAGES_FETCH_FAILED` - Cannot retrieve packages
- `STATS_FETCH_FAILED` - Cannot retrieve server stats

### Process Errors
- `SERVICE_UNAVAILABLE` - Required service not available
- `PROCESS_NOT_FOUND` - Process ID not found
- `PROCESS_NOT_CANCELLABLE` - Process cannot be cancelled
- `BULK_CREATION_ERROR` - Error starting bulk creation
- `EXPORT_ERROR` - Error exporting results

### File Errors
- `INVALID_FORMAT` - Unsupported file format
- `NO_RESULTS` - No results to export
- `TEMPLATE_ERROR` - Error generating template

## 📝 Request Examples

### Complete cURL Examples

#### Test WHM Connection
```bash
curl -X POST http://localhost:3000/api/whm/validate \
  -H "Content-Type: application/json" \
  -d '{
    "whmCredentials": {
      "host": "your-server.com",
      "port": 2087,
      "username": "root",
      "apiToken": "your-api-token",
      "ssl": true
    }
  }'
```

#### Start Bulk Creation
```bash
curl -X POST http://localhost:3000/api/bulk/create \
  -H "Content-Type: application/json" \
  -d '{
    "whmCredentials": {
      "host": "your-server.com",
      "port": 2087,
      "username": "root",
      "apiToken": "your-api-token",
      "ssl": true
    },
    "domains": ["test1.com", "test2.com"],
    "emailTemplate": "admin@{domain}",
    "plan": "default"
  }'
```

#### Check Process Status
```bash
curl http://localhost:3000/api/process/550e8400-e29b-41d4-a716-446655440000
```

#### Export Results as CSV
```bash
curl -o results.csv \
  "http://localhost:3000/api/process/550e8400-e29b-41d4-a716-446655440000/export?format=csv"
```

## 🔒 Security Notes

### API Security
- All requests are rate-limited (100 requests per 15 minutes by default)
- Input validation is performed server-side
- WHM credentials are not stored permanently
- CORS is configurable for production use

### Production Considerations
- Use HTTPS in production
- Configure proper CORS origins
- Set secure session secrets
- Enable proper logging levels
- Monitor rate limiting effectiveness

---

For more information, see the [Main Documentation](README.md) or [Quick Start Guide](QUICK_START.md).