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
        // The 'domains' variable from req.body is an array of objects from the frontend's first validation pass.
        // We need to extract the original lines and re-validate them with the correct AdSense flag.
        const enableAdsenseEditing = wordpress.enableAdsenseEditing || false;
        const originalDomainLines = domains.map(domainObj => domainObj.originalLine);

        const domainValidation = validateDomains(originalDomainLines, enableAdsenseEditing);
        
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

        // domains is now an array of objects: { originalLine, domainName, adsenseId, adsenseIdError }
        for (let i = 0; i < domains.length; i++) {
            const domainObject = domains[i];
            const { domainName, adsenseId, originalLine, adsenseIdError } = domainObject;

            const currentProcessState = processStateManager.getProcessStatus(processId);
            if (currentProcessState && currentProcessState.status === 'cancelled') {
                processStateManager.addLog(processId, { level: 'warn', message: `[${domainName}] Process cancelled by user. Halting further operations.` });
                break; 
            }

            processStateManager.updateProgress(processId, { currentItem: domainName, current: processed, total: domains.length, successful, failed, skipped });

            if (adsenseIdError) { // Log AdSense ID format error if present
                processStateManager.addLog(processId, { level: 'warn', message: `[${domainName}] Note: ${adsenseIdError}` });
            }

            if (cloneOptions && cloneOptions.enabled && cloneOptions.masterDomain && domainName === cloneOptions.masterDomain) {
                processStateManager.addLog(processId, { level: 'warn', message: `[${domainName}] Skipped: This is the master source domain and cannot be a target for operations.` });
                skipped++;
            } else {
                processStateManager.addLog(processId, { level: 'info', message: `[${domainName}] Starting operations...` });
                
                const operationResult = await processSingleDomainOperations(
                    ssh, 
                    domainName, 
                    adsenseId, // Pass the parsed adsenseId
                    wpConfig, 
                    processStateManager, 
                    processId,
                    cloneOptions, // Pass cloneOptions for cloning logic
                    sourceInstanceId // Pass sourceInstanceId for cloning
                );
                results.push(operationResult);

                if (operationResult.overallSuccess) { // We'll add an 'overallSuccess' flag
                    successful++;
                } else {
                    failed++;
                }
            }
            
            processed++;
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

async function processSingleDomainOperations(ssh, domainName, adsenseId, wpConfig, processStateManager, processId, cloneOptions, sourceInstanceId) {
    const logPrefix = `[${domainName}]`;
    let cpanelUser = null; // To store cPanel user for AdSense editing if password change fails but cloning was ok
    let overallSuccess = false; // Flag for the entire operation for this domain
    let passwordChangeSuccess = false;
    let adsenseEditStatus = { success: false, message: 'Not attempted' };
    let cloneSuccess = true; // Assume true if not applicable or successful

    try {
        // Step 1: Kloning Opsional (moved inside)
        if (cloneOptions && cloneOptions.enabled && sourceInstanceId) {
            processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} [Clone] Attempting to clone from source ID ${sourceInstanceId}.` });
            const cloneResult = await cloneWordPress(ssh, sourceInstanceId, domainName, processStateManager, processId);
            if (!cloneResult.success) {
                const cloneErrorMsg = `Clone operation failed: ${cloneResult.error}`;
                processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} [Clone] ${cloneErrorMsg}` });
                // Return immediately as other operations depend on a successful clone (if cloning was attempted)
                return { domain: domainName, overallSuccess: false, error: cloneErrorMsg, cloneStatus: cloneResult };
            }
            processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} [Clone] Clone successful. Target Instance ID: ${cloneResult.data?.targetInstanceId}` });
            cloneSuccess = true;
        }

        // Step 2: Password Change and Magic Link (Original logic from processSingleDomain)
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} [PasswordChange] Getting cPanel username...` });
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domainName}/{found=1} found && /user:/{print $2; exit}'`;
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
        let standardLoginUrl = `https://${domainName}/wp-admin/`; // Use domainName
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Creating magic login link...` });
        try {
            const randomEmail = generateRandomEmail(domainName); // Use domainName
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=/home/${cpanelUser}/public_html`;
            const tlwpResult = await ssh.execCommand(tlwpCreateCmd);
            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                const tlwpJson = JSON.parse(tlwpResult.stdout.trim());
                if (tlwpJson.status === 'success' && tlwpJson.login_url) {
                    magicLinkData = tlwpJson;
                    processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Magic login created: ${tlwpJson.login_url}` });
                } else {
                    processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link creation reported non-success: ${tlwpJson.message || 'Unknown issue'}` });
                    magicLinkData = null;
                }
            } else {
                processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link command failed. STDERR: ${tlwpResult.stderr || 'N/A'}` });
                magicLinkData = null;
            }
        } catch (magicLinkError) {
            processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} Magic link creation exception: ${magicLinkError.message}` });
            magicLinkData = null;
        }
        
        passwordChangeSuccess = true; // Mark password change as successful
        
        const passwordChangeResultData = {
            domain: domainName, // Use domainName
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
            maxLoginLimit: (magicLinkData && magicLinkData.max_login_limit) ? magicLinkData.max_login_limit : null,
        };

        // Step 3: Edit AdSense ID in header.php
        // This step only runs if AdSense editing is enabled (adsenseId is present) AND password change was successful.
        if (wpConfig.enableAdsenseEditing && adsenseId && passwordChangeSuccess && cpanelUser) {
            processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} [AdSenseEdit] Attempting to edit header.php for AdSense ID: ${adsenseId}` });
            const adsenseResult = await editAdsenseInHeaderFile(ssh, cpanelUser, domainName, adsenseId, processStateManager, processId);
            adsenseEditStatus = adsenseResult;
            if (!adsenseResult.success) {
                processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} [AdSenseEdit] ${adsenseResult.message}` });
                // Not failing the overall success for AdSense edit failure, but logging it.
            } else {
                 processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} [AdSenseEdit] ${adsenseResult.message}` });
            }
        } else if (wpConfig.enableAdsenseEditing && adsenseId) { // AdSense was intended but prerequisites failed
            adsenseEditStatus.message = 'Skipped: AdSense edit prerequisites (e.g., password change, cPanel user) not met.';
            processStateManager.addLog(processId, { level: 'warn', message: `${logPrefix} [AdSenseEdit] ${adsenseEditStatus.message}` });
        }
        // If !wpConfig.enableAdsenseEditing, adsenseEditStatus remains { success: false, message: 'Not attempted' }

        overallSuccess = passwordChangeSuccess; // Overall success depends on password change; AdSense is optional enhancement.
        
        return { 
            ...passwordChangeResultData,
            overallSuccess, 
            adsenseEditStatus 
        };
        
    } catch (error) {
        // This catch block handles errors from getting cPanel user, WP user, or updating password.
        processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} [PasswordChange/Setup] Error: ${error.message}` });
        return { 
            domain: domainName, 
            overallSuccess: false, 
            error: error.message, 
            cpanelUser, // Include cpanelUser if obtained before error
            adsenseEditStatus: { success: false, message: 'Skipped due to password change error.' } 
        };
    }
}

async function editAdsenseInHeaderFile(ssh, cpanelUser, domainName, adsenseId, processStateManager, processId) {
    const logPrefix = `[${domainName}] [AdSenseEdit]`;
    const filePath = `/home/${cpanelUser}/public_html/wp-content/themes/superfast/header.php`;
    const tempFilePath = `/home/${cpanelUser}/header.php.tmp.${Date.now()}`; // Temporary file for sed output

    try {
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Checking if header file exists: ${filePath}` });

        // Check if file exists
        const checkFileCmd = `if [ -f "${filePath}" ]; then echo "exists"; else echo "not_exists"; fi`;
        const fileCheckResult = await ssh.execCommand(checkFileCmd);

        if (fileCheckResult.stdout.trim() !== "exists") {
            return { success: false, message: `File not found: ${filePath}` };
        }
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} File ${filePath} exists. Proceeding with edit.` });

        // Escape adsenseId for sed if it contains special characters (though it should be numeric)
        const escapedAdsenseId = adsenseId.replace(/[&/\\$'"]/g, '\\$&');
        
        // Regex to find any existing 16-digit ca-pub ID.
        // It matches 'ca-pub-' followed by 16 digits.
        const oldAdsensePattern = "[0-9]\\{16\\}"; // For use in sed, digits 0-9, 16 times.
        
        // Using sed for in-place replacement. Create a backup first.
        // 1. Backup the file
        // 2. Use sed to replace.
        //    Pattern: <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-ANY_16_DIGIT_ID"
        //    Replacement: <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-NEW_ID"
        //    The regex captures the part before the ID and the closing quote.
        //    Using a different delimiter for sed (#) to avoid issues with slashes in URLs.
        const backupCmd = `cp "${filePath}" "${filePath}.bak_adsense_$(date +%s)"`; // Unique backup name
        // The sed command now uses a regex to match any 16-digit number after ca-pub-
        const sedCmd = `sed -i.bak_sed "s#\\(<script async src=\\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\\)${oldAdsensePattern}\\(\\"\\)#\\1${escapedAdsenseId}\\2#g" "${filePath}"`;

        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Backing up file: ${backupCmd}` });
        const backupResult = await ssh.execCommand(backupCmd);
        if (backupResult.code !== 0) {
            const errMsg = `Failed to backup ${filePath}. STDERR: ${backupResult.stderr}`;
            processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} ${errMsg}` });
            return { success: false, message: errMsg };
        }

        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Executing sed command to replace AdSense ID.` });
        const editResult = await ssh.execCommand(sedCmd);

        if (editResult.code !== 0) {
            const errMsg = `Failed to edit ${filePath} with sed. STDERR: ${editResult.stderr}. Attempting to restore from backup.`;
            processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} ${errMsg}` });
            // Attempt to restore backup
            await ssh.execCommand(`mv "${filePath}.bak_adsense_change" "${filePath}"`);
            return { success: false, message: errMsg };
        }

        // Verify if the change was made (optional, but good for confirmation)
        // This check is simplified; a more robust check might involve checking for the new ID.
        // For now, we assume sed success (exit code 0) means the replacement happened if the pattern was found.
        processStateManager.addLog(processId, { level: 'info', message: `${logPrefix} Successfully edited ${filePath}. Attempted to replace existing ca-pub-XXXXXXXXXXXXXXXX with ${adsenseId}.` });
        return { success: true, message: `AdSense ID updated in ${filePath}` };

    } catch (error) {
        const errorMsg = `Exception during AdSense ID edit in ${filePath}: ${error.message}`;
        processStateManager.addLog(processId, { level: 'error', message: `${logPrefix} ${errorMsg}` });
        logger.error(`${logPrefix} AdSense edit error:`, error);
        // Attempt to restore backup if an exception occurred after backup
        await ssh.execCommand(`if [ -f "${filePath}.bak_adsense_change" ]; then mv "${filePath}.bak_adsense_change" "${filePath}"; fi`);
        return { success: false, message: errorMsg };
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
