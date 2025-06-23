const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateAllCredentials, startAllInOneProcess } = require('../services/allInOneProcessor');

const router = express.Router();

// Route to validate all credentials at once
router.post('/validate', async (req, res) => {
    try {
        // SSH credentials are now the same as WHM credentials
        const { whm, cloudflare } = req.body;
        const ssh = {
            host: whm.host,
            username: whm.username,
            password: whm.password
        };
        await validateAllCredentials(whm, cloudflare, ssh);
        res.json({ success: true, message: 'All credentials validated successfully.' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Route to start the all-in-one process
router.post('/start', (req, res) => {
    const { whm, cloudflare, wpPassword, masterCloneDomain, domains } = req.body;

    // Basic validation
    if (!whm || !cloudflare || !wpPassword || !masterCloneDomain || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({ message: 'Missing required configuration parameters.' });
    }

    // SSH credentials are now the same as WHM credentials
    const ssh = {
        host: whm.host,
        username: whm.username,
        password: whm.password
    };

    const processId = uuidv4();
    const processInfo = {
        type: 'all-in-one',
        domains: domains,
        masterCloneDomain: masterCloneDomain,
    };

    // Use the processStateManager from the request object
    req.processStateManager.startProcess(processId, processInfo);

    // Start the async process without awaiting it
    startAllInOneProcess(processId, { whm, cloudflare, ssh, wpPassword, masterCloneDomain, domains }, req.processStateManager);

    res.status(202).json({ message: 'Process started', processId });
});

module.exports = router;
