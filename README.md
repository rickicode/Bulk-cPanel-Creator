# 🛠️ cPanel Bulk Creator

A full-stack web application for creating multiple cPanel accounts efficiently through the WHM API. This application provides a modern, user-friendly interface with real-time progress monitoring and comprehensive error handling.

## ✨ Features

### 🚀 Core Functionality
- **Bulk Account Creation**: Create hundreds of cPanel accounts simultaneously
- **WHM API Integration**: Direct integration with WHM servers using API tokens or credentials
- **Real-time Monitoring**: Live progress updates and logging via WebSocket
- **Domain Validation**: Automatic validation and duplicate detection
- **Batch Processing**: Configurable batch sizes with concurrency control
- **Export Results**: Download results in CSV, JSON, or TXT formats

### 🔒 Security Features
- **Input Validation**: Comprehensive server-side validation and sanitization
- **Rate Limiting**: Built-in protection against API abuse
- **Secure Authentication**: Support for WHM API tokens (recommended) and password auth
- **CORS Protection**: Configurable CORS policies
- **Security Headers**: Helmet.js for security hardening

### 📊 Monitoring & Logging
- **Live Process Monitoring**: Real-time progress tracking
- **Detailed Logging**: Comprehensive logging with multiple levels
- **Error Handling**: Graceful error handling with detailed error messages
- **Process Management**: Start, stop, and monitor multiple processes
- **Health Checks**: Built-in health monitoring endpoints

### 🎨 User Interface
- **Modern Design**: Clean, responsive interface with gradient backgrounds
- **Real-time Updates**: Live progress bars and statistics
- **Form Validation**: Client-side validation with instant feedback
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices
- **Dark Theme Logs**: Professional console-style logging interface

## 🏗️ Architecture

### Backend (Node.js + Express)
```
src/
├── services/
│   ├── whmApi.js          # WHM API integration
│   ├── bulkCreator.js     # Bulk creation logic
│   └── socketManager.js   # WebSocket management
├── routes/
│   ├── index.js           # Main API routes
│   ├── whm.js            # WHM-related endpoints
│   ├── bulk.js           # Bulk operation endpoints
│   └── process.js        # Process management endpoints
├── utils/
│   ├── logger.js         # Winston logging configuration
│   └── validator.js      # Input validation and sanitization
└── server.js             # Main server file
```

### Frontend (Vanilla JavaScript)
```
public/
├── index.html            # Main HTML interface
├── styles.css           # Modern CSS with responsive design
└── app.js              # Frontend JavaScript application
```

## 📋 Requirements

### System Requirements
- **Node.js**: 16.x or higher
- **npm**: 8.x or higher
- **Memory**: 512MB RAM minimum (2GB recommended for large batches)
- **Storage**: 100MB free space

### WHM Server Requirements
- **WHM/cPanel**: Version 11.102 or higher
- **API Access**: Root access or API token with account creation permissions
- **Network**: HTTP/HTTPS access to WHM server (ports 2086/2087)

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd cpanel-bulk-creator
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Security (REQUIRED)
SESSION_SECRET=your-super-secret-session-key-here
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Processing Configuration
MAX_CONCURRENT_ACCOUNTS=5
REQUEST_TIMEOUT=30000
BATCH_SIZE=10

# Logging
LOG_LEVEL=info
```

### 4. Start the Application
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

### 5. Access the Application
Open your browser and navigate to: `http://localhost:3000`

## ☁️ Vercel Deployment

This application is fully optimized for **Vercel** deployment with serverless functions:

### Quick Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/cpanel-bulk-creator)

### Manual Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

### Environment Variables for Vercel
Configure these in your Vercel dashboard:
```bash
NODE_ENV=production
LOG_LEVEL=info
MAX_CONCURRENT_ACCOUNTS=3      # Optimized for serverless
BATCH_SIZE=5                   # Smaller batches for reliability
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Vercel-Specific Features
- ✅ **Serverless Functions**: Automatic scaling and zero server management
- ✅ **Socket.IO Support**: Real-time WebSocket connections
- ✅ **30-second Function Timeout**: Optimized batch processing
- ✅ **Global CDN**: Fast static asset delivery
- ✅ **Environment Variables**: Secure configuration management

📖 **For detailed deployment instructions, see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)**

## 📚 Usage Guide

### 1. Configure WHM Credentials
1. **Enter WHM Details**:
   - Host/IP address of your WHM server
   - Port (default: 2087)
   - Username (usually 'root')
   - Enable SSL if your server supports HTTPS

2. **Choose Authentication Method**:
   - **API Token** (Recommended): Generate from WHM → Development → API Tokens
   - **Password**: Use root password (less secure)

3. **Test Connection**: Click "Test Connection" to verify credentials

### 2. Configure Account Settings
- **Email Template**: Set default email pattern (use `{domain}` placeholder)
- **Package/Plan**: Select from available WHM packages
- **Resource Limits**: Set disk quota, bandwidth, and feature limits
- **Access Permissions**: Configure shell access and CGI permissions

### 3. Prepare Domain List
1. **Enter Domains**: Add one domain per line in the text area
2. **Validate Domains**: Click "Validate Domains" to check format and duplicates
3. **Review Results**: Check validation summary for any issues

### 4. Start Bulk Creation
1. **Verify Settings**: Ensure all configurations are correct
2. **Start Process**: Click "Start Bulk Creation"
3. **Monitor Progress**: Watch real-time progress and logs
4. **Export Results**: Download results when complete

## 🔧 API Documentation

### Authentication Endpoints
```http
POST /api/whm/validate
Content-Type: application/json

{
  "whmCredentials": {
    "host": "your-server.com",
    "port": 2087,
    "username": "root",
    "apiToken": "your-token",
    "ssl": true
  }
}
```

### Bulk Creation Endpoints
```http
POST /api/bulk/create
Content-Type: application/json

{
  "whmCredentials": { /* WHM credentials */ },
  "domains": ["example1.com", "example2.com"],
  "emailTemplate": "admin@{domain}",
  "plan": "default",
  "quota": "unlimited",
  "bwlimit": "unlimited"
}
```

### Process Management
```http
GET /api/process/{processId}        # Get process status
DELETE /api/process/{processId}     # Cancel process
GET /api/process/{processId}/export # Export results
```

### WebSocket Events
- `connected`: Connection established
- `process-started`: Bulk creation started
- `progress`: Progress updates
- `log`: Log messages
- `process-completed`: Process finished
- `process-failed`: Process failed

## ⚙️ Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `MAX_CONCURRENT_ACCOUNTS` | Concurrent account creation | 5 |
| `BATCH_SIZE` | Domains per batch | 10 |
| `REQUEST_TIMEOUT` | API request timeout (ms) | 30000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

### Performance Tuning
- **Concurrent Accounts**: Adjust based on server capacity
- **Batch Size**: Larger batches = fewer API calls but more memory usage
- **Request Timeout**: Increase for slower WHM servers
- **Rate Limiting**: Protect against abuse while allowing legitimate use

## 🔍 Troubleshooting

### Common Issues

#### Connection Problems
```
Error: WHM connection failed
```
**Solutions**:
- Verify WHM server is accessible
- Check firewall settings (ports 2086/2087)
- Confirm SSL/non-SSL settings match server
- Validate API token permissions

#### Account Creation Failures
```
Error: Domain already exists
```
**Solutions**:
- Check for existing accounts with same domain
- Verify domain format (must be valid FQDN)
- Ensure sufficient server resources

#### Performance Issues
```
Process running slowly
```
**Solutions**:
- Reduce `MAX_CONCURRENT_ACCOUNTS`
- Decrease `BATCH_SIZE`
- Increase `REQUEST_TIMEOUT`
- Monitor WHM server load

### Debug Mode
Enable detailed logging:
```bash
LOG_LEVEL=debug npm run dev
```

Check logs directory:
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

### Health Check
Monitor application health:
```bash
curl http://localhost:3000/health
```

## 🛡️ Security Considerations

### Production Deployment
1. **Use HTTPS**: Always use SSL/TLS in production
2. **Environment Variables**: Never commit sensitive data to version control
3. **Rate Limiting**: Configure appropriate limits for your use case
4. **Firewall**: Restrict access to necessary ports only
5. **Updates**: Keep dependencies updated for security patches

### WHM Security
1. **API Tokens**: Prefer API tokens over passwords
2. **Permissions**: Grant minimal required permissions
3. **IP Restrictions**: Limit API access to specific IPs
4. **Monitoring**: Enable WHM access logs and monitoring

## 📈 Performance Monitoring

### Metrics to Monitor
- **Memory Usage**: Check for memory leaks during large batches
- **CPU Usage**: Monitor during concurrent processing
- **Network**: Track API call frequency and response times
- **Error Rates**: Monitor failed account creation rates

### Scaling Considerations
- **Horizontal Scaling**: Use load balancer for multiple instances
- **Database**: Consider adding database for large-scale deployments
- **Caching**: Implement Redis for session management
- **Queue System**: Use job queues for very large batches

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with proper tests
4. Commit changes: `git commit -am 'Add feature'`
5. Push to branch: `git push origin feature-name`
6. Submit a pull request

### Development Guidelines
- Follow ESLint configuration
- Add JSDoc comments for functions
- Include error handling
- Write descriptive commit messages
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Documentation**: Check this README and inline code comments
- **Community**: Join discussions in GitHub Discussions

### Professional Support
For enterprise deployments and custom development, contact the development team.

---

**⚠️ Important Notice**: This application creates actual cPanel accounts on your WHM server. Always test in a development environment before using in production. The developers are not responsible for any data loss or server issues resulting from the use of this software.