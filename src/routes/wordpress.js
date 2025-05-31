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
        
        // Step 2: Get current WordPress admin username
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
        
        // Step 5: Generate magic login link using WP-CLI
        addLog(processState, `Generating magic login link for ${oldWpUser}...`, 'info');
        
        let magicLink = null;
        let hasMagicLink = false;
        
        try {
            // Try multiple magic link methods
            const magicLinkCommands = [
                // Method 1: Try wp-magic-login plugin
                `wp user magic-login ${oldWpUser} --path=/home/${cpanelUser}/public_html --allow-root`,
                // Method 2: Try wp-temporary-login-without-password plugin
                `wp user temporary-login ${oldWpUser} --path=/home/${cpanelUser}/public_html --allow-root`,
                // Method 3: Generate autologin URL with wp eval
                `wp eval "echo add_query_arg(array('autologin' => wp_create_nonce('autologin_' . ${oldWpUser}), 'user_id' => ${oldWpUser}), admin_url());" --path=/home/${cpanelUser}/public_html --allow-root`
            ];
            
            for (const cmd of magicLinkCommands) {
                addLog(processState, `Trying magic link command...`, 'info');
                const result = await ssh.execCommand(cmd);
                
                if (result.code === 0 && result.stdout.trim() && result.stdout.trim() !== 'wp-admin/') {
                    magicLink = result.stdout.trim();
                    
                    // Ensure the link includes the domain if it's relative
                    if (magicLink.startsWith('/')) {
                        magicLink = `https://${domain}${magicLink}`;
                    } else if (!magicLink.startsWith('http')) {
                        magicLink = `https://${domain}/wp-admin/${magicLink}`;
                    }
                    
                    hasMagicLink = true;
                    addLog(processState, `✓ Magic login link generated successfully`, 'success');
                    break;
                }
            }
            
            // If no magic link worked, use standard login URL
            if (!hasMagicLink) {
                magicLink = `https://${domain}/wp-admin/`;
                addLog(processState, `Magic link plugins not available, using standard login URL`, 'warning');
            }
            
        } catch (error) {
            // Fallback: generate standard login URL
            magicLink = `https://${domain}/wp-admin/`;
            addLog(processState, `Failed to generate magic link, using standard login URL: ${error.message}`, 'warning');
        }
        
        return {
            domain,
            success: true,
            cpanelUser,
            wpUser: oldWpUser,
            wpEmail: wpEmail,
            newWpPassword: wpConfig.newPassword,
            loginUrl: magicLink,
            hasMagicLink: hasMagicLink
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