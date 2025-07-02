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
    const { whm, cloudflare, wpPassword, masterCloneDomain, domains, cloneMasterDomain, forceRecreate } = req.body;

    // Basic validation
    if (!whm || !wpPassword || !masterCloneDomain || !Array.isArray(domains) || domains.length === 0) {
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
    startAllInOneProcess(processId, { whm, cloudflare, ssh, wpPassword, masterCloneDomain, domains, cloneMasterDomain, forceRecreate }, req.processStateManager);

    res.status(202).json({ message: 'Process started', processId });
});

/**
 * Manual endpoint to run /scripts/updateuserdomains via SSH.
 * Expects SSH credentials in the body (host, username, password).
 */
router.post('/update-user-domains', async (req, res) => {
    const { ssh } = req.body;
    if (!ssh || !ssh.host || !ssh.username || !ssh.password) {
        return res.status(400).json({ success: false, message: 'Missing SSH credentials.' });
    }
    try {
        const { SshSession } = require('../services/sshService');
        const sshSession = new SshSession(ssh);
        await sshSession.connect();
        const updateResult = await sshSession.ssh.execCommand('/scripts/updateuserdomains');
        await sshSession.dispose();
        if (updateResult.code === 0) {
            return res.json({ success: true, message: '/scripts/updateuserdomains executed successfully.', stdout: updateResult.stdout });
        } else {
            return res.status(500).json({
                success: false,
                message: `/scripts/updateuserdomains failed.`,
                stdout: updateResult.stdout,
                stderr: updateResult.stderr
            });
        }
    } catch (e) {
        return res.status(500).json({ success: false, message: `Error running /scripts/updateuserdomains: ${e.message}` });
    }
});

module.exports = router;
