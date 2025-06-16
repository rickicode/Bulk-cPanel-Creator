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
        const { cloneOptions } = wordpress; // Extract cloneOptions
        
        if (!ssh || !wordpress || !domains || domains.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        if (cloneOptions && cloneOptions.enabled && !cloneOptions.masterDomain) {
            return res.status(400).json({
                success: false,
                error: 'Master Source Domain is required when cloning is enabled.'
            });
        }
        
        const { validateDomains } = require('../utils/validator');
        const domainValidation = validateDomains(domains);
        
        if (domainValidation.valid.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid domains provided'
            });
        }
        
        const processId = uuidv4();
        
        const processInfo = {
            type: 'wordpress-admin-change',
            domains: domainValidation.valid, 
            ssh,
            wordpress 
        };
        
        // Log if master domain is in target list, but allow process to start (it will be skipped in the loop)
        if (cloneOptions && cloneOptions.enabled && cloneOptions.masterDomain) {
            if (domainValidation.valid.includes(cloneOptions.masterDomain)) {
                 processStateManager.addLog(processId, { 
                    level: 'warn',
                    message: `Master Source Domain (${cloneOptions.masterDomain}) was found in the target domain list and will be automatically skipped during processing. It's recommended to remove it from the target list for clarity.`
                });
            }
        }
        
        const processState = req.processStateManager.startProcess(processId, processInfo);
        
        req.processStateManager.updateProgress(processId, {
            status: 'starting',
            current: 0,
            total: domainValidation.valid.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            currentItem: null
        });
        
        req.processStateManager.addLog(processId, {
            level: 'info',
            message: `WordPress admin change process initiated for ${domainValidation.valid.length} domains.`
        });
        
        activeProcesses.set(processId, { ...processState }); 
        
        processWordPressAdminChanges(processId, ssh, wordpress, domainValidation.valid, req.processStateManager, cloneOptions);
        
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

// Stop process
router.post('/stop/:processId', (req, res) => {
    try {
        const { processId } = req.params;
        const processState = req.processStateManager.getProcessStatus(processId);
        
        if (!processState || processState.status === 'completed' || processState.status === 'failed' || processState.status === 'cancelled') {
            return res.status(404).json({
                success: false,
                error: 'Process not found, already completed, or already cancelled.'
            });
        }
        
        req.processStateManager.updateProgress(processId, {
            status: 'cancelled'
        });
        
        req.processStateManager.addLog(processId, {
            level: 'warn',
            message: 'Process stop requested by user.'
        });
        
        const ssh = sshConnections.get(processId);
        if (ssh && ssh.isConnected()) {
            ssh.dispose();
            sshConnections.delete(processId);
            req.processStateManager.addLog(processId, { level: 'info', message: 'SSH connection for process closed due to stop request.' });
        }
        
        activeProcesses.delete(processId);
        
        res.json({
            success: true,
            message: 'Process stop initiated successfully.'
        });
        
    } catch (error) {
        logger.error('Stop process error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

async function processWordPressAdminChanges(processId, sshConfig, wpConfig, domains, processStateManager, cloneOptions) {
    const ssh = new NodeSSH();
    let sourceInstanceId = null;
    
    let results = [];
    let processed = 0;
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    try {
        processStateManager.updateProgress(processId, { status: 'connecting', current: 0, total: domains.length, successful, failed, skipped });
        processStateManager.addLog(processId, { level: 'info', message: 'Connecting to SSH server...' });
        
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
        processStateManager.addLog(processId, { level: 'info', message: 'SSH connection established.' });

        if (cloneOptions && cloneOptions.enabled && cloneOptions.masterDomain) {
            processStateManager.addLog(processId, { level: 'info', message: `Attempting to get instance ID for master source domain: ${cloneOptions.masterDomain}` });
            try {
                const instanceIdCmd = `wp-toolkit --list -domain-name ${cloneOptions.masterDomain} -format json`;
                const instanceIdResult = await ssh.execCommand(instanceIdCmd);
                if (instanceIdResult.code !== 0 || !instanceIdResult.stdout) {
                    throw new Error(`Failed to get instance ID command execution error. STDERR: ${instanceIdResult.stderr || 'N/A'}`);
                }
                const instances = JSON.parse(instanceIdResult.stdout.trim());
                if (instances && instances.length > 0 && instances[0].id) {
                    sourceInstanceId = instances[0].id;
                    processStateManager.addLog(processId, { level: 'info', message: `Successfully retrieved sourceInstanceId: ${sourceInstanceId} for ${cloneOptions.masterDomain}.` });
                } else {
                    throw new Error('Instance ID not found in wp-toolkit response.');
                }
            } catch (error) {
                processStateManager.addLog(processId, { level: 'error', message: `Failed to get sourceInstanceId for ${cloneOptions.masterDomain}: ${error.message}. Cloning will be disabled.` });
                cloneOptions.enabled = false; 
            }
        }
        
        processStateManager.updateProgress(processId, { status: 'processing' });

        for (let i = 0; i < domains.length; i++) {
            const domain = domains[i];
            const currentProcessState = processStateManager.getProcessStatus(processId);
            if (currentProcessState && currentProcessState.status === 'cancelled') {
                processStateManager.addLog(processId, { level: 'warn', message: `[${domain}] Process cancelled by user. Halting further operations.` });
                break; 
            }

            processStateManager.updateProgress(processId, { currentItem: domain, current: processed, total: domains.length, successful, failed, skipped });

            if (cloneOptions && cloneOptions.enabled && cloneOptions.masterDomain && domain === cloneOptions.masterDomain) {
                processStateManager.addLog(processId, { level: 'warn', message: `[${domain}] Skipped: This is the master source domain and cannot be a target for operations.` });
                skipped++;
                // processed is incremented at the end of the loop iteration
            } else {
                processStateManager.addLog(processId, { level: 'info', message: `[${domain}] Starting operations...` });
                let operationFailedThisDomain = false;

                try {
                    if (cloneOptions && cloneOptions.enabled && sourceInstanceId) {
                        processStateManager.addLog(processId, { level: 'info', message: `[${domain}] Attempting to clone from source ID ${sourceInstanceId}. Waiting for completion...` });
                        const cloneResult = await cloneWordPress(ssh, sourceInstanceId, domain, processStateManager, processId);
                        if (!cloneResult.success) {
                            const cloneErrorMsg = `[${domain}] Clone operation failed: ${cloneResult.error}`;
                            processStateManager.addLog(processId, { level: 'error', message: cloneErrorMsg });
                            results.push({ domain, success: false, error: cloneErrorMsg }); // Single result for this domain
                            failed++;
                            operationFailedThisDomain = true;
                        } else {
                            processStateManager.addLog(processId, { level: 'info', message: `[${domain}] Clone successful. Target Instance ID: ${cloneResult.data?.targetInstanceId}` });
                        }
                    }

                    if (!operationFailedThisDomain) {
                        const passwordChangeResult = await processSingleDomain(ssh, domain, wpConfig, processStateManager, processId);
                        results.push(passwordChangeResult); // Single result for this domain
                        if (passwordChangeResult.success) {
                            successful++;
                        } else {
                            failed++;
                        }
                    }
                } catch (domainError) {
                    const domainErrorMsg = `[${domain}] Unexpected error during processing for this domain: ${domainError.message}`;
                    processStateManager.addLog(processId, { level: 'error', message: domainErrorMsg });
                    results.push({ domain, success: false, error: domainError.message });
                    failed++;
                }
            }
            
            processed++; // Increment processed for every domain attempted or skipped (master)
            processStateManager.updateProgress(processId, { current: processed, successful, failed, skipped });
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        }
        
        processStateManager.completeProcess(processId, { results, totalProcessed: processed, successful, failed, skipped, totalDomains: domains.length });
        processStateManager.addLog(processId, { level: 'info', message: `Process completed: ${successful} successful, ${failed} failed, ${skipped} skipped.` });
        
    } catch (error) { // Catch errors from initial SSH connection or other fatal setup issues
        processStateManager.failProcess(processId, { message: `Fatal error during process setup or execution: ${error.message}`, error: error.message });
        processStateManager.addLog(processId, { level: 'error', message: `Fatal error: ${error.message}` });
        logger.error('WordPress admin changing process error:', error);
    } finally {
        if (ssh && ssh.isConnected()) {
            ssh.dispose();
        }
        sshConnections.delete(processId);
        activeProcesses.delete(processId); 
        processStateManager.addLog(processId, { level: 'info', message: 'Process cleanup finished.' });
    }
}

function generateRandomEmail(domain) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}@${domain}`;
}

async function processSingleDomain(ssh, domain, wpConfig, processStateManager, processId) {
    const logPrefix = `[${domain}] [PasswordChange]`;
    try {
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Getting cPanel username...` });
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        if (cpanelUserResult.code !== 0 || !cpanelUserResult.stdout.trim()) {
            throw new Error(`Failed to get cPanel user. STDERR: ${cpanelUserResult.stderr || 'N/A'}`);
        }
        const cpanelUser = cpanelUserResult.stdout.trim();
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Found cPanel user: ${cpanelUser}` });

        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Getting WordPress admin username...` });
        const wpUserCmd = `wp user list --path=/home/${cpanelUser}/public_html --role=administrator --field=user_login --allow-root`;
        const wpUserResult = await ssh.execCommand(wpUserCmd);
        if (wpUserResult.code !== 0 || !wpUserResult.stdout.trim()) {
            throw new Error(`Failed to get WordPress admin user. STDERR: ${wpUserResult.stderr || 'N/A'}`);
        }
        const oldWpUser = wpUserResult.stdout.trim().split('\n')[0];
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Found WordPress admin: ${oldWpUser}` });

        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Getting WordPress admin email...` });
        const wpEmailCmd = `wp user get ${oldWpUser} --field=email --path=/home/${cpanelUser}/public_html --allow-root`;
        const wpEmailResult = await ssh.execCommand(wpEmailCmd);
        const wpEmail = (wpEmailResult.code === 0 && wpEmailResult.stdout.trim()) ? wpEmailResult.stdout.trim() : `admin@${domain}`;
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} WordPress admin email: ${wpEmail}` });

        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Updating password for admin user: ${oldWpUser}` });
        const updatePasswordCmd = `wp user update ${oldWpUser} --user_pass='${wpConfig.newPassword}' --path=/home/${cpanelUser}/public_html --allow-root`;
        const updatePasswordResult = await ssh.execCommand(updatePasswordCmd);
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WordPress admin password. STDERR: ${updatePasswordResult.stderr || 'N/A'}`);
        }
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Password updated successfully for user: ${oldWpUser}` });

        let magicLinkData = null;
        let standardLoginUrl = `https://${domain}/wp-admin/`;
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Creating magic login link...` });
        try {
            const randomEmail = generateRandomEmail(domain);
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=/home/${cpanelUser}/public_html`;
            const tlwpResult = await ssh.execCommand(tlwpCreateCmd);
            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                const tlwpJson = JSON.parse(tlwpResult.stdout.trim());
                if (tlwpJson.status === 'success' && tlwpJson.login_url) {
                    magicLinkData = tlwpJson; // Store the whole object
                    processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Magic login created: ${tlwpJson.login_url}` }); // Log directly from tlwpJson
                } else {
                    processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link creation reported non-success: ${tlwpJson.message || 'Unknown issue'}` });
                    magicLinkData = null; // Ensure magicLinkData is null if creation wasn't fully successful
                }
            } else {
                processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link command failed. STDERR: ${tlwpResult.stderr || 'N/A'}` });
                magicLinkData = null; // Ensure magicLinkData is null
            }
        } catch (magicLinkError) {
            processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link creation exception: ${magicLinkError.message}` });
            magicLinkData = null; // Ensure magicLinkData is null on exception
        }
        
        return {
            domain,
            success: true,
            cpanelUser,
            wpUser: oldWpUser,
            wpEmail: wpEmail,
            newPassword: wpConfig.newPassword,
            loginUrl: (magicLinkData && magicLinkData.login_url) ? magicLinkData.login_url : standardLoginUrl,
            hasMagicLink: !!(magicLinkData && magicLinkData.login_url),
            tempUser: (magicLinkData && magicLinkData.username) ? magicLinkData.username : null,
            tempUserId: (magicLinkData && magicLinkData.user_id) ? magicLinkData.user_id : null,
            expires: (magicLinkData && magicLinkData.expires) ? magicLinkData.expires : null,
            maxLoginLimit: (magicLinkData && magicLinkData.max_login_limit) ? magicLinkData.max_login_limit : null
        };
        
    } catch (error) {
        processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} Error: ${error.message}` });
        return { domain, success: false, error: error.message };
    }
}

async function cloneWordPress(ssh, sourceInstanceId, targetDomain, processStateManager, processId) {
    const logPrefix = `[${targetDomain}] [Clone]`;
    processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Executing clone: wp-toolkit --clone -source-instance-id ${sourceInstanceId} -target-domain-name ${targetDomain} -force-overwrite yes -format json. Awaiting response...` });

    try {
        const cloneCmd = `wp-toolkit --clone -source-instance-id ${sourceInstanceId} -target-domain-name ${targetDomain} -force-overwrite yes -format json`;
        const cloneResultCmd = await ssh.execCommand(cloneCmd, { execOptions: { pty: true } });

        processStateManager.addLog(processId, { level: 'debug', message: `${logPrefix} Clone command completed. STDOUT: ${cloneResultCmd.stdout || 'N/A'}, STDERR: ${cloneResultCmd.stderr || 'N/A'}, Code: ${cloneResultCmd.code}` });

        if (cloneResultCmd.code !== 0 || !cloneResultCmd.stdout) {
            const errorMsg = `Clone command failed. Exit Code: ${cloneResultCmd.code}. STDERR: ${cloneResultCmd.stderr || 'No stderr output'}. STDOUT: ${cloneResultCmd.stdout || 'No stdout output'}.`;
            processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} ${errorMsg}` });
            return { success: false, error: errorMsg, data: null };
        }

        const cloneOutput = JSON.parse(cloneResultCmd.stdout.trim());
        if (cloneOutput && cloneOutput.targetInstanceId) {
            processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} WordPress cloned successfully. New instance ID: ${cloneOutput.targetInstanceId}` });
            return { success: true, error: null, data: cloneOutput };
        } else {
            const errorMsg = `Cloning to ${targetDomain} command succeeded (exit code 0) but response was unexpected or missing targetInstanceId: ${cloneResultCmd.stdout}`;
            processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} ${errorMsg}` });
            return { success: false, error: errorMsg, data: cloneOutput };
        }
    } catch (error) {
        const errorMsg = `Exception during cloning for ${targetDomain}: ${error.message}`;
        processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} ${errorMsg}` });
        logger.error(`${logPrefix} Clone WordPress error details:`, error);
        return { success: false, error: errorMsg, data: null };
    }
}

module.exports = router;
