const express = require('express');
const { NodeSSH } = require('node-ssh');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const router = express.Router();

// Store active SSH connections and processes
const activeProcesses = new Map();
const sshConnections = new Map();

// Test SSH connection
router.post('/test-ssh', async (req, res) => {
    try {
        const { host, port, username, password } = req.body;
        
        if (!host || !username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required SSH credentials'
            });
        }
        
        const ssh = new NodeSSH();
        
        try {
            await ssh.connect({
                host,
                port: port || 22,
                username,
                password,
                tryKeyboard: true,
                onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
                    if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
                        finish([password]);
                    }
                }
            });
            
            // Test basic command
            await ssh.execCommand('echo "test"');
            
            ssh.dispose();
            
            res.json({
                success: true,
                message: 'SSH connection successful'
            });
            
        } catch (sshError) {
            ssh.dispose();
            throw sshError;
        }
        
    } catch (error) {
        logger.error('SSH test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start WordPress admin changing process
router.post('/start-changing', async (req, res) => {
    try {
        const { ssh, wordpress, domains } = req.body;
        
        if (!ssh || !wordpress || !domains || domains.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        
        // Validate domains first (similar to index page)
        const { validateDomains } = require('../utils/validator');
        const domainValidation = validateDomains(domains);
        
        if (domainValidation.valid.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid domains provided'
            });
        }
        
        const processId = uuidv4();
        
        // Initialize process state
        const processInfo = {
            type: 'wordpress-admin-change',
            domains: domainValidation.valid, // Use only valid domains
            ssh,
            wordpress
        };
        
        const processState = req.processStateManager.startProcess(processId, processInfo);
        
        // Initialize process with proper data structure for processStateManager
        req.processStateManager.updateProgress(processId, {
            status: 'starting',
            current: 0,
            total: domainValidation.valid.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            currentItem: null
        });
        
        // Add initial log message
        req.processStateManager.addLog(processId, {
            level: 'info',
            message: `WordPress admin change process started for ${domainValidation.valid.length} domains`
        });
        
        // Extended state for WordPress processing (local tracking only)
        const wpProcessState = {
            ...processState,
            domains: domainValidation.valid,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            total: domainValidation.valid.length,
            currentDomain: null,
            results: [],
            logs: [],
            completed: false,
            error: null
        };
        
        activeProcesses.set(processId, wpProcessState);
        
        // Start processing in background
        processWordPressAdminChanges(processId, ssh, wordpress, domainValidation.valid, req.processStateManager);
        
        res.json({
            success: true,
            processId,
            message: 'WordPress admin changing process started',
            totalDomains: domainValidation.valid.length,
            invalidDomains: domainValidation.invalid.length,
            duplicateDomains: domainValidation.duplicates.length
        });
        
    } catch (error) {
        logger.error('Start changing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Note: Process status is handled by the shared processStateManager via /api/process/:id/status
// No custom status route needed here

// Stop process
router.post('/stop/:processId', (req, res) => {
    try {
        const { processId } = req.params;
        const processState = activeProcesses.get(processId);
        
        if (!processState) {
            return res.status(404).json({
                success: false,
                error: 'Process not found'
            });
        }
        
        // Mark process as cancelled in processStateManager
        req.processStateManager.updateProgress(processId, {
            status: 'cancelled'
        });
        
        req.processStateManager.addLog(processId, {
            level: 'warn',
            message: 'Process stopped by user request'
        });
        
        // Close SSH connection if exists
        const ssh = sshConnections.get(processId);
        if (ssh) {
            ssh.dispose();
            sshConnections.delete(processId);
        }
        
        // Clean up local state
        activeProcesses.delete(processId);
        
        res.json({
            success: true,
            message: 'Process stopped'
        });
        
    } catch (error) {
        logger.error('Stop process error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main processing function
async function processWordPressAdminChanges(processId, sshConfig, wpConfig, domains, processStateManager) {
    const ssh = new NodeSSH();
    
    try {
        // Update process status to connecting
        processStateManager.updateProgress(processId, {
            status: 'connecting',
            currentItem: null,
            current: 0,
            total: domains.length,
            successful: 0,
            failed: 0,
            skipped: 0
        });
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: 'Connecting to SSH server...'
        });
        
        // Connect to SSH
        await ssh.connect({
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            password: sshConfig.password,
            tryKeyboard: true,
            onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
                if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
                    finish([sshConfig.password]);
                }
            }
        });
        
        sshConnections.set(processId, ssh);
        processStateManager.addLog(processId, {
            level: 'info',
            message: 'SSH connection established'
        });
        
        // Update status to processing
        processStateManager.updateProgress(processId, {
            status: 'processing'
        });
        
        const results = [];
        let processed = 0;
        let successful = 0;
        let failed = 0;
        
        // Process each domain
        for (let i = 0; i < domains.length; i++) {
            const currentProcess = processStateManager.getProcessStatus(processId);
            if (currentProcess && currentProcess.status === 'cancelled') {
                processStateManager.addLog(processId, {
                    level: 'warn',
                    message: 'Process stopped by user'
                });
                break;
            }
            
            const domain = domains[i];
            
            // Update current domain
            processStateManager.updateProgress(processId, {
                currentItem: domain
            });
            
            processStateManager.addLog(processId, {
                level: 'info',
                message: `Processing domain: ${domain}`
            });
            
            try {
                const result = await processSingleDomain(ssh, domain, wpConfig, processStateManager, processId);
                results.push(result);
                
                if (result.success) {
                    successful++;
                    processStateManager.addLog(processId, {
                        level: 'info',
                        message: `✓ Successfully changed admin for ${domain}`
                    });
                } else {
                    failed++;
                    processStateManager.addLog(processId, {
                        level: 'error',
                        message: `✗ Failed to change admin for ${domain}: ${result.error}`
                    });
                }
                
            } catch (error) {
                failed++;
                const errorMsg = `Error processing ${domain}: ${error.message}`;
                processStateManager.addLog(processId, {
                    level: 'error',
                    message: errorMsg
                });
                
                results.push({
                    domain,
                    success: false,
                    error: error.message
                });
            }
            
            processed++;
            
            // Update progress
            processStateManager.updateProgress(processId, {
                current: processed,
                total: domains.length,
                successful,
                failed,
                skipped: 0
            });
            
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Complete process
        processStateManager.completeProcess(processId, {
            results,
            totalProcessed: processed,
            successful,
            failed,
            skipped: 0,
            totalDomains: domains.length
        });
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Process completed: ${successful} successful, ${failed} failed`
        });
        
    } catch (error) {
        processStateManager.failProcess(processId, {
            message: `Fatal error: ${error.message}`,
            error: error.message
        });
        
        processStateManager.addLog(processId, {
            level: 'error',
            message: `Fatal error: ${error.message}`
        });
        
        logger.error('WordPress admin changing process error:', error);
    } finally {
        // Clean up SSH connection
        if (ssh) {
            ssh.dispose();
        }
        sshConnections.delete(processId);
    }
}

// Generate random email with WordPress domain
function generateRandomEmail(domain) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}@${domain}`;
}

// Process single domain
async function processSingleDomain(ssh, domain, wpConfig, processStateManager, processId) {
    try {
        // Step 1: Get cPanel username from domain using WHM API
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Getting cPanel username for ${domain}...`
        });
        
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        
        if (cpanelUserResult.code !== 0) {
            throw new Error(`Failed to get cPanel user: ${cpanelUserResult.stderr}`);
        }
        
        const cpanelUser = cpanelUserResult.stdout.trim();
        if (!cpanelUser) {
            throw new Error('cPanel user not found for domain');
        }
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Found cPanel user: ${cpanelUser}`
        });
        
        // Step 2: Get current WordPress admin username for password change
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Getting WordPress admin username...`
        });
        
        const wpUserCmd = `wp user list --path=/home/${cpanelUser}/public_html --role=administrator --field=user_login --allow-root`;
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Running command: ${wpUserCmd}`
        });
        const wpUserResult = await ssh.execCommand(wpUserCmd);
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `WP user command result - Code: ${wpUserResult.code}, Output: ${wpUserResult.stdout}, Error: ${wpUserResult.stderr}`
        });
        
        if (wpUserResult.code !== 0) {
            throw new Error(`Failed to get WordPress admin user: ${wpUserResult.stderr}`);
        }
        
        const oldWpUser = wpUserResult.stdout.trim().split('\n')[0]; // Get first admin user
        if (!oldWpUser) {
            throw new Error('WordPress admin user not found');
        }
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Found WordPress admin: ${oldWpUser}`
        });
        
        // Step 3: Get WordPress admin email
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Getting WordPress admin email...`
        });
        
        const wpEmailCmd = `wp user get ${oldWpUser} --field=email --path=/home/${cpanelUser}/public_html --allow-root`;
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Running command: ${wpEmailCmd}`
        });
        const wpEmailResult = await ssh.execCommand(wpEmailCmd);
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Email command result - Code: ${wpEmailResult.code}, Output: ${wpEmailResult.stdout}, Error: ${wpEmailResult.stderr}`
        });
        
        const wpEmail = wpEmailResult.code === 0 && wpEmailResult.stdout.trim() ?
                       wpEmailResult.stdout.trim() :
                       `admin@${domain}`;
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `WordPress admin email: ${wpEmail}`
        });
        
        // Step 4: Update WordPress admin password
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Updating password for WordPress admin user: ${oldWpUser}`
        });
        
        const updatePasswordCmd = `wp user update ${oldWpUser} --user_pass='${wpConfig.newPassword}' --path=/home/${cpanelUser}/public_html --allow-root`;
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Running command: ${updatePasswordCmd.replace(wpConfig.newPassword, '***HIDDEN***')}`
        });
        const updatePasswordResult = await ssh.execCommand(updatePasswordCmd);
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Password update result - Code: ${updatePasswordResult.code}, Output: ${updatePasswordResult.stdout}, Error: ${updatePasswordResult.stderr}`
        });
        
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WordPress admin password: ${updatePasswordResult.stderr}`);
        }
        
        processStateManager.addLog(processId, {
            level: 'info',
            message: `WordPress admin password updated successfully for user: ${oldWpUser}`
        });
        
        let magicLinkData = null;
        let standardLoginUrl = `https://${domain}/wp-admin/`;
        
        // Step 5: Create magic login link
        processStateManager.addLog(processId, {
            level: 'info',
            message: `Creating magic login link for ${domain}...`
        });
        
        try {
            // Generate random email with WordPress domain
            const randomEmail = generateRandomEmail(domain);
            processStateManager.addLog(processId, {
            level: 'info',
            message: `Generated random email: ${randomEmail}`
        });
            
            // Create temporary login using wp tlwp create command
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=/home/${cpanelUser}/public_html`;
            processStateManager.addLog(processId, {
            level: 'info',
            message: `Running command: ${tlwpCreateCmd}`
        });
            const tlwpResult = await ssh.execCommand(tlwpCreateCmd);
            
            processStateManager.addLog(processId, {
            level: 'info',
            message: `TLWP command result - Code: ${tlwpResult.code}, Output: ${tlwpResult.stdout}, Error: ${tlwpResult.stderr}`
        });
            
            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                // Parse JSON output from wp tlwp create command
                try {
                    const tlwpData = JSON.parse(tlwpResult.stdout.trim());
                    
                    // Validate required fields in JSON response
                    if (tlwpData.status === 'success' && tlwpData.login_url) {
                        magicLinkData = {
                            username: tlwpData.username || 'tempuser',
                            email: tlwpData.email || randomEmail,
                            userId: tlwpData.user_id,
                            role: tlwpData.role || 'administrator',
                            loginUrl: tlwpData.login_url,
                            expires: tlwpData.expires,
                            maxLoginLimit: tlwpData.max_login_limit || 1,
                            status: tlwpData.status,
                            message: tlwpData.message
                        };
                        
                        processStateManager.addLog(processId, {
            level: 'info',
            message: `✓ Magic login created successfully`
        });
                        processStateManager.addLog(processId, {
            level: 'info',
            message: `Magic login URL: ${magicLinkData.loginUrl}`
        });
                        processStateManager.addLog(processId, {
            level: 'info',
            message: `Magic Username: ${magicLinkData.username}`
        });
                        processStateManager.addLog(processId, {
            level: 'info',
            message: `Magic User ID: ${magicLinkData.userId}`
        });
                        processStateManager.addLog(processId, {
            level: 'info',
            message: `Expires: ${magicLinkData.expires}`
        });
                    } else {
                        processStateManager.addLog(processId, {
            level: 'warn',
            message: `Magic link creation failed: ${tlwpData.message || 'Unknown error'}`
        });
                    }
                } catch (parseError) {
                    processStateManager.addLog(processId, {
            level: 'warn',
            message: `Failed to parse TLWP output as JSON: ${parseError.message}`
        });
                }
            } else {
                processStateManager.addLog(processId, {
            level: 'warn',
            message: `Magic link creation failed: ${tlwpResult.stderr}`
        });
            }
        } catch (error) {
            processStateManager.addLog(processId, {
            level: 'warn',
            message: `Magic link creation error: ${error.message}`
        });
        }
        
        return {
            domain,
            success: true,
            cpanelUser,
            wpUser: oldWpUser,
            wpEmail: wpEmail,
            newPassword: wpConfig.newPassword,
            loginUrl: magicLinkData ? magicLinkData.loginUrl : standardLoginUrl,
            hasMagicLink: !!magicLinkData,
            tempUser: magicLinkData ? magicLinkData.username : null,
            tempUserId: magicLinkData ? magicLinkData.userId : null,
            expires: magicLinkData ? magicLinkData.expires : null,
            maxLoginLimit: magicLinkData ? magicLinkData.maxLoginLimit : null
        };
        
    } catch (error) {
        return {
            domain,
            success: false,
            error: error.message
        };
    }
}


module.exports = router;