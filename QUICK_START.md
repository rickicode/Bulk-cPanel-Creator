# 🚀 Quick Start Guide - cPanel Bulk Creator

Get up and running with cPanel Bulk Creator in 5 minutes!

## 📋 Prerequisites

- Node.js 16+ installed
- Access to a WHM server with API permissions
- Basic knowledge of cPanel/WHM

## ⚡ Quick Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

**Edit `.env` file - REQUIRED:**
```bash
# Generate a secure session secret (32+ characters)
SESSION_SECRET=your-super-secret-session-key-change-this-now

# Generate a 32-character encryption key
ENCRYPTION_KEY=abcdef1234567890abcdef1234567890

# Optional: Adjust these if needed
PORT=3000
MAX_CONCURRENT_ACCOUNTS=3
BATCH_SIZE=5
```

### 3. Start the Application
```bash
npm start
```

### 4. Open in Browser
Navigate to: http://localhost:3000

## 🎯 First Time Setup

### Step 1: Configure WHM Connection
1. **Host**: Enter your WHM server hostname/IP
2. **Port**: Usually 2087 (SSL) or 2086 (non-SSL)
3. **Username**: Usually 'root'
4. **Authentication**: Choose API Token (recommended)

### Step 2: Get WHM API Token
1. Login to WHM as root
2. Go to: **Development → Manage API Tokens**
3. Click **Generate Token**
4. Copy the token and paste it in the application

### Step 3: Test Connection
Click **"Test Connection"** to verify your WHM credentials.

### Step 4: Prepare Domains
Enter domains in the text area (one per line):
```
example1.com
example2.com
example3.com
```

### Step 5: Validate Domains
Click **"Validate Domains"** to check for duplicates and format issues.

### Step 6: Start Creation
Click **"Start Bulk Creation"** and monitor the real-time progress!

## 🛠️ Quick Configuration Tips

### For Small Batches (< 50 domains)
```bash
MAX_CONCURRENT_ACCOUNTS=3
BATCH_SIZE=10
REQUEST_TIMEOUT=30000
```

### For Large Batches (50+ domains)
```bash
MAX_CONCURRENT_ACCOUNTS=2
BATCH_SIZE=5
REQUEST_TIMEOUT=60000
```

### For Slow WHM Servers
```bash
MAX_CONCURRENT_ACCOUNTS=1
BATCH_SIZE=3
REQUEST_TIMEOUT=90000
```

## 🔧 Docker Quick Start

### Using Docker Compose (Recommended)
```bash
# Set environment variables
export SESSION_SECRET="your-secure-session-secret-here"
export ENCRYPTION_KEY="your-32-character-encryption-key"

# Start the application
docker-compose up -d

# View logs
docker-compose logs -f
```

### Using Docker Only
```bash
# Build image
docker build -t cpanel-bulk-creator .

# Run container
docker run -d \
  --name cpanel-bulk-creator \
  -p 3000:3000 \
  -e SESSION_SECRET="your-secure-session-secret" \
  -e ENCRYPTION_KEY="your-32-character-key" \
  cpanel-bulk-creator
```

## 📊 Example Usage

### Sample Domain List
```
testsite1.com
mywebsite.net
example-business.org
demo-site.info
sample-domain.co
```

### Sample Account Configuration
- **Email Template**: `admin@{domain}`
- **Package**: Default or custom package
- **Disk Quota**: unlimited or specific MB
- **Bandwidth**: unlimited or specific MB

## 🚨 Important Notes

### Security
- **Never share API tokens** - they provide full WHM access
- **Use HTTPS in production** - configure SSL certificates
- **Change default secrets** - update SESSION_SECRET and ENCRYPTION_KEY

### Performance
- **Start small** - test with 5-10 domains first
- **Monitor resources** - watch CPU and memory usage
- **Adjust concurrency** - reduce if experiencing timeouts

### WHM Server
- **Check server load** - high load may cause timeouts
- **Verify permissions** - ensure API token has account creation rights
- **Monitor disk space** - ensure sufficient space for new accounts

## 🆘 Quick Troubleshooting

### Connection Issues
```
❌ Error: WHM connection failed
```
**Quick Fix:**
1. Verify WHM server is running
2. Check host/port settings
3. Confirm API token is valid
4. Try using password instead of token

### Slow Performance
```
⚠️ Process running slowly
```
**Quick Fix:**
1. Reduce `MAX_CONCURRENT_ACCOUNTS` to 1
2. Decrease `BATCH_SIZE` to 3
3. Increase `REQUEST_TIMEOUT` to 60000

### Memory Issues
```
❌ Out of memory error
```
**Quick Fix:**
1. Restart the application
2. Process smaller batches
3. Reduce `BATCH_SIZE` to 5

### Domain Validation Errors
```
❌ Invalid domain format
```
**Quick Fix:**
1. Use valid domain names only (e.g., example.com)
2. Remove subdomains and special characters
3. One domain per line

## 📞 Need Help?

### Check Logs
```bash
# Application logs
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log

# Docker logs
docker-compose logs -f cpanel-bulk-creator
```

### Health Check
```bash
# Check if application is running
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45
}
```

### Support Resources
- 📖 [Full README](README.md) - Complete documentation
- 🐛 [GitHub Issues](https://github.com/your-repo/issues) - Report bugs
- 💡 [GitHub Discussions](https://github.com/your-repo/discussions) - Ask questions

---

**🎉 Congratulations!** You're now ready to create cPanel accounts in bulk. Start with a small test batch to familiarize yourself with the interface, then scale up as needed.

**⚠️ Remember**: Always test in a development environment before using in production!