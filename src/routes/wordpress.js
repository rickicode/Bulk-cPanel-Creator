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
        
        const processId = uuidv4();
        
        // Initialize process state
        const processInfo = {
            type: 'wordpress-admin-change',
            domains,
            ssh,
            wordpress
        };
        
        const processState = req.processStateManager.startProcess(processId, processInfo);
        
        // Extended state for WordPress processing
        const wpProcessState = {
            ...processState,
            domains,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            total: domains.length,
            currentDomain: null,
            results: [],
            logs: [],
            completed: false,
            error: null
        };
        
        activeProcesses.set(processId, wpProcessState);
        
        // Start processing in background
        processWordPressAdminChanges(processId, ssh, wordpress, domains, req.processStateManager);
        
        res.json({
            success: true,
            processId,
            message: 'WordPress admin changing process started'
        });
        
    } catch (error) {
        logger.error('Start changing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get process status
router.get('/status/:processId', (req, res) => {
    try {
        const { processId } = req.params;
        const processState = activeProcesses.get(processId);
        
        if (!processState) {
            return res.status(404).json({
                success: false,
                error: 'Process not found'
            });
        }
        
        // Get new logs since last request
        const newLogs = processState.logs.splice(0);
        
        res.json({
            success: true,
            data: {
                ...processState,
                logs: newLogs
            }
        });
        
    } catch (error) {
        logger.error('Status check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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
        
        // Mark process as stopped
        processState.status = 'stopped';
        processState.completed = true;
        
        // Close SSH connection if exists
        const ssh = sshConnections.get(processId);
        if (ssh) {
            ssh.dispose();
            sshConnections.delete(processId);
        }
        
        // Clean up
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
    const processState = activeProcesses.get(processId);
    const ssh = new NodeSSH();
    
    try {
        processState.status = 'connecting';
        addLog(processState, 'Connecting to SSH server...', 'info');
        
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
        addLog(processState, 'SSH connection established', 'success');
        
        processState.status = 'processing';
        
        // Process each domain
        for (let i = 0; i < domains.length; i++) {
            if (processState.status === 'stopped') {
                addLog(processState, 'Process stopped by user', 'warning');
                break;
            }
            
            const domain = domains[i];
            processState.currentDomain = domain;
            
            addLog(processState, `Processing domain: ${domain}`, 'info');
            
            try {
                const result = await processSingleDomain(ssh, domain, wpConfig, processState);
                processState.results.push(result);
                
                if (result.success) {
                    processState.successful++;
                    addLog(processState, `✓ Successfully changed admin for ${domain}`, 'success');
                } else {
                    processState.failed++;
                    addLog(processState, `✗ Failed to change admin for ${domain}: ${result.error}`, 'error');
                }
                
            } catch (error) {
                processState.failed++;
                const errorMsg = `Error processing ${domain}: ${error.message}`;
                addLog(processState, errorMsg, 'error');
                
                processState.results.push({
                    domain,
                    success: false,
                    error: error.message
                });
            }
            
            processState.processed++;
            
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        processState.status = 'completed';
        processState.completed = true;
        processState.currentDomain = null;
        
        addLog(processState, `Process completed: ${processState.successful} successful, ${processState.failed} failed`, 'info');
        
    } catch (error) {
        processState.status = 'error';
        processState.error = error.message;
        processState.completed = true;
        
        addLog(processState, `Fatal error: ${error.message}`, 'error');
        logger.error('WordPress admin changing process error:', error);
    } finally {
        // Clean up SSH connection
        if (ssh) {
            ssh.dispose();
        }
        sshConnections.delete(processId);
        
        // Clean up process after some time
        setTimeout(() => {
            activeProcesses.delete(processId);
            if (processStateManager) {
                processStateManager.deleteProcess(processId);
            }
        }, 300000); // 5 minutes
    }
}

// Generate random email with WordPress domain
function generateRandomEmail(domain) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}@${domain}`;
}

// Process single domain
async function processSingleDomain(ssh, domain, wpConfig, processState) {
    try {
        // Step 1: Get cPanel username from domain using WHM API
        addLog(processState, `Getting cPanel username for ${domain}...`, 'info');
        
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        
        if (cpanelUserResult.code !== 0) {
            throw new Error(`Failed to get cPanel user: ${cpanelUserResult.stderr}`);
        }
        
        const cpanelUser = cpanelUserResult.stdout.trim();
        if (!cpanelUser) {
            throw new Error('cPanel user not found for domain');
        }
        
        addLog(processState, `Found cPanel user: ${cpanelUser}`, 'info');
        
        // Step 2: Get current WordPress admin username for password change
        addLog(processState, `Getting WordPress admin username...`, 'info');
        
        const wpUserCmd = `wp user list --path=/home/${cpanelUser}/public_html --role=administrator --field=user_login --allow-root`;
        addLog(processState, `Running command: ${wpUserCmd}`, 'info');
        const wpUserResult = await ssh.execCommand(wpUserCmd);
        
        addLog(processState, `WP user command result - Code: ${wpUserResult.code}, Output: ${wpUserResult.stdout}, Error: ${wpUserResult.stderr}`, 'info');
        
        if (wpUserResult.code !== 0) {
            throw new Error(`Failed to get WordPress admin user: ${wpUserResult.stderr}`);
        }
        
        const oldWpUser = wpUserResult.stdout.trim().split('\n')[0]; // Get first admin user
        if (!oldWpUser) {
            throw new Error('WordPress admin user not found');
        }
        
        addLog(processState, `Found WordPress admin: ${oldWpUser}`, 'info');
        
        // Step 3: Get WordPress admin email
        addLog(processState, `Getting WordPress admin email...`, 'info');
        
        const wpEmailCmd = `wp user get ${oldWpUser} --field=email --path=/home/${cpanelUser}/public_html --allow-root`;
        addLog(processState, `Running command: ${wpEmailCmd}`, 'info');
        const wpEmailResult = await ssh.execCommand(wpEmailCmd);
        
        addLog(processState, `Email command result - Code: ${wpEmailResult.code}, Output: ${wpEmailResult.stdout}, Error: ${wpEmailResult.stderr}`, 'info');
        
        const wpEmail = wpEmailResult.code === 0 && wpEmailResult.stdout.trim() ?
                       wpEmailResult.stdout.trim() :
                       `admin@${domain}`;
        
        addLog(processState, `WordPress admin email: ${wpEmail}`, 'info');
        
        // Step 4: Update WordPress admin password
        addLog(processState, `Updating password for WordPress admin user: ${oldWpUser}`, 'info');
        
        const updatePasswordCmd = `wp user update ${oldWpUser} --user_pass='${wpConfig.newPassword}' --path=/home/${cpanelUser}/public_html --allow-root`;
        addLog(processState, `Running command: ${updatePasswordCmd.replace(wpConfig.newPassword, '***HIDDEN***')}`, 'info');
        const updatePasswordResult = await ssh.execCommand(updatePasswordCmd);
        
        addLog(processState, `Password update result - Code: ${updatePasswordResult.code}, Output: ${updatePasswordResult.stdout}, Error: ${updatePasswordResult.stderr}`, 'info');
        
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WordPress admin password: ${updatePasswordResult.stderr}`);
        }
        
        addLog(processState, `WordPress admin password updated successfully for user: ${oldWpUser}`, 'success');
        
        let magicLinkData = null;
        let standardLoginUrl = `https://${domain}/wp-admin/`;
        
        // Step 5: Create magic login link
        addLog(processState, `Creating magic login link for ${domain}...`, 'info');
        
        try {
            // Generate random email with WordPress domain
            const randomEmail = generateRandomEmail(domain);
            addLog(processState, `Generated random email: ${randomEmail}`, 'info');
            
            // Create temporary login using wp tlwp create command
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=/home/${cpanelUser}/public_html`;
            addLog(processState, `Running command: ${tlwpCreateCmd}`, 'info');
            const tlwpResult = await ssh.execCommand(tlwpCreateCmd);
            
            addLog(processState, `TLWP command result - Code: ${tlwpResult.code}, Output: ${tlwpResult.stdout}, Error: ${tlwpResult.stderr}`, 'info');
            
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
                        
                        addLog(processState, `✓ Magic login created successfully`, 'success');
                        addLog(processState, `Magic Username: ${magicLinkData.username}`, 'info');
                        addLog(processState, `Magic User ID: ${magicLinkData.userId}`, 'info');
                        addLog(processState, `Expires: ${magicLinkData.expires}`, 'info');
                    } else {
                        addLog(processState, `Magic link creation failed: ${tlwpData.message || 'Unknown error'}`, 'warning');
                    }
                } catch (parseError) {
                    addLog(processState, `Failed to parse TLWP output as JSON: ${parseError.message}`, 'warning');
                }
            } else {
                addLog(processState, `Magic link creation failed: ${tlwpResult.stderr}`, 'warning');
            }
        } catch (error) {
            addLog(processState, `Magic link creation error: ${error.message}`, 'warning');
        }
        
        return {
            domain,
            success: true,
            cpanelUser,
            wpUser: oldWpUser,
            wpEmail: wpEmail,
            newWpPassword: wpConfig.newPassword,
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

// Helper function to add log
function addLog(processState, message, level = 'info') {
    const logEntry = {
        message,
        level,
        timestamp: new Date()
    };
    
    processState.logs.push(logEntry);
    logger.info(`[${processState.id}] ${message}`);
}

module.exports = router;