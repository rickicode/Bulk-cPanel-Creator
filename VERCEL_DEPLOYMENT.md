# Vercel Deployment Guide

This guide explains how to deploy the cPanel Bulk Creator application to Vercel.

## 🚀 Quick Deployment

### 1. **Prepare for Deployment**

Clone or download this repository to your local machine.

### 2. **Environment Variables Setup**

In your Vercel dashboard, set the following environment variables:

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_CONCURRENT_ACCOUNTS=3
BATCH_SIZE=5
```

### 3. **Deploy to Vercel**

#### Option A: Via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Via GitHub Integration
1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Vercel will automatically deploy on every push

#### Option C: Via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Import your project
3. Configure environment variables
4. Deploy

## 📋 **Environment Variables Reference**

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Application environment | `development` | ✅ |
| `PORT` | Server port | `3000` | ❌ |
| `LOG_LEVEL` | Logging level | `info` | ❌ |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` | ❌ |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` | ❌ |
| `MAX_CONCURRENT_ACCOUNTS` | Max concurrent account creation | `5` | ❌ |
| `BATCH_SIZE` | Batch size for processing | `10` | ❌ |

## 🔧 **Vercel Configuration**

The `vercel.json` file includes:

- **Build Configuration**: Uses `@vercel/node` for the Express server
- **Route Handling**: Properly routes Socket.IO and API requests
- **Default Environment Variables**: Pre-configured for immediate deployment
- **Production Optimized**: Serverless-friendly settings

### **Configuration Notes**

#### **Current Setup (Recommended)**
The configuration uses `builds` in vercel.json for precise control:
- ✅ All settings defined in code
- ✅ Version controlled configuration
- ✅ Consistent deployments across environments
- ⚠️ Note: This overrides Vercel Project Settings UI (this is intentional)

#### **Alternative: Project Settings UI**
If you prefer using Vercel's Dashboard, you can remove the `builds` section and configure via UI instead.

## ⚠️ **Important Notes**

### **Socket.IO Considerations**
- Vercel Functions have a 30-second timeout limit
- For very large bulk operations (>50 domains), consider using a dedicated server
- Socket.IO connections work but may disconnect on function timeouts

### **Stateless Architecture**
- Process data is stored in memory during execution
- Large bulk operations should be broken into smaller batches
- Consider implementing persistent storage for very large operations

### **Performance Tips**
- Reduce `MAX_CONCURRENT_ACCOUNTS` to 3 for Vercel (default: 5)
- Use smaller `BATCH_SIZE` (5 instead of 10) for better reliability
- Monitor function execution times in Vercel dashboard

## 🎯 **Post-Deployment Checklist**

- [ ] Environment variables configured
- [ ] WHM connection test working
- [ ] Socket.IO real-time updates functioning
- [ ] Bulk account creation working with small batches
- [ ] Export functionality working
- [ ] Static assets (CSS, JS) loading correctly

## 🔗 **Useful Links**

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)
- [Environment Variables on Vercel](https://vercel.com/docs/projects/environment-variables)

## 🚨 **Troubleshooting**

### Function Timeout Issues
If you experience timeouts with large operations:
1. Reduce batch size: `BATCH_SIZE=3`
2. Reduce concurrency: `MAX_CONCURRENT_ACCOUNTS=2`
3. Process domains in smaller chunks

### Socket.IO Connection Issues
- Ensure WebSocket support is enabled
- Check browser console for connection errors
- Verify all routes are properly configured in `vercel.json`

### Static Assets Not Loading
- Verify `public/` directory structure
- Check `vercel.json` routing configuration
- Ensure static files are included in deployment