module.exports = (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: 'vercel',
    message: 'cPanel Bulk Creator API is running'
  });
};