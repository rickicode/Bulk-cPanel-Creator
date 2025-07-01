const WHMApi = require('./whmApi');
const CloudflareApi = require('./cloudflareApi');
const { SshSession, validateSshCredentials: validateSsh } = require('./sshService');

// Use the same concurrency setting as the other tools for consistency.
const CONCURRENCY_LIMIT = parseInt(process.env.MAX_CONCURRENT_ACCOUNTS, 10) || 10;

/**
 * Validates all credentials concurrently by instantiating API classes.
 * @param {object} whmConfig - WHM credentials
 * @param {object} cloudflareConfig - Cloudflare credentials
 * @param {object} sshConfig - SSH credentials
 */
async function validateAllCredentials(whmConfig, cloudflareConfig, sshConfig) {
    try {
        const whm = new WHMApi(whmConfig);
        const cloudflare = new CloudflareApi(cloudflareConfig);

        const [whmResult, cfResult, sshResult] = await Promise.allSettled([
            whm.testConnection(),
            cloudflare.testConnection(),
            validateSsh(sshConfig),
        ]);

        if (whmResult.status === 'rejected' || (whmResult.value && !whmResult.value.success)) {
            throw new Error(`WHM validation failed: ${whmResult.reason?.message || whmResult.value?.error}`);
        }
        if (cfResult.status === 'rejected' || (cfResult.value && !cfResult.value.success)) {
            throw new Error(`Cloudflare validation failed: ${cfResult.reason?.message || cfResult.value?.error}`);
        }
        if (sshResult.status === 'rejected') {
            throw new Error(`SSH validation failed: ${sshResult.reason?.message}`);
        }

    } catch (error) {
        throw new Error(`Credential validation failed: ${error.message}`);
    }
}

/**
 * Starts the asynchronous all-in-one process with concurrency control.
 * @param {string} processId - The unique ID for this process.
 * @param {object} config - The configuration object.
 * @param {ProcessStateManager} processStateManager - The shared process state manager instance.
 */
async function startAllInOneProcess(processId, config, processStateManager) {
    const { domains, ...restConfig } = config;
    const domainQueue = [...domains];
    let activePromises = 0;

    // Add a flag to track if a rebuild is needed
    processStateManager.updateProcessInfo(processId, { wasForceRecreated: false });

    // Instantiate APIs once for the entire process
    const whm = new WHMApi(config.whm);
    const cloudflare = new CloudflareApi(config.cloudflare);

    const processNext = async () => {
        if (domainQueue.length === 0 && activePromises === 0) {
            const finalState = processStateManager.getProcessStatus(processId);
            processStateManager.completeProcess(processId, finalState.results);

            // After all domains are processed, check if a rebuild is needed
            if (finalState.wasForceRecreated) {
                processStateManager.addLog(processId, { level: 'info', message: '--- Starting final Nginx configuration rebuild ---' });
                const sshSession = new SshSession(config.ssh);
                try {
                    await sshSession.connect();
                    await sshSession.rebuildNginxConfig();
                    processStateManager.addLog(processId, { level: 'info', message: 'Nginx configuration rebuild completed successfully.' });
                } catch (e) {
                    processStateManager.addLog(processId, { level: 'error', message: `Final Nginx rebuild failed: ${e.message}` });
                } finally {
                    await sshSession.dispose();
                }
            }
            return;
        }

        while (domainQueue.length > 0 && activePromises < CONCURRENCY_LIMIT) {
            activePromises++;
            const domainEntry = domainQueue.shift();
            
            processDomain(processId, domainEntry, restConfig, whm, cloudflare, processStateManager)
                .finally(() => {
                    activePromises--;
                    processNext();
                });
        }
    };

    processNext();
}

/**
 * Processes a single domain through all the required steps with a retry mechanism.
 * @param {string} processId - The unique ID for this process.
 * @param {string} domainEntry - The domain string, e.g., "domain.com|1234567890"
 * @param {object} config - The configuration object.
 * @param {WHMApi} whm - Instantiated WHM API client.
 * @param {CloudflareApi} cloudflare - Instantiated Cloudflare API client.
 * @param {ProcessStateManager} processStateManager - The shared process state manager instance.
 */
async function processDomain(processId, domainEntry, config, whm, cloudflare, processStateManager) {
    const [domain, adsenseIdNumbers] = domainEntry.includes('|') ? domainEntry.split('|') : [domainEntry, null];
    const { cloneMasterDomain } = config;
    const processState = processStateManager.getProcessStatus(processId);
    const log = (level, message, data = {}) => {
        processStateManager.addLog(processId, { level, message: `[${domain}] ${message}`, data });
    };

    let success = false;
    let cpanelAccountInfo = {};
    let finalError = null;
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    processStateManager.updateProgress(processId, { ...processState.progress, currentItem: domain });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const sshSession = new SshSession(config.ssh);
        try {
            if (attempt > 1) {
                log('info', `--- Starting attempt ${attempt} of ${maxRetries} ---`);
            } else {
                log('info', 'Processing started...');
            }

            // Step 1: Add DNS record to Cloudflare
            log('info', 'Stage: Configuring DNS...');
            cloudflare.recordValue = config.whm.host;
            const dnsResult = await cloudflare.addOrUpdateDnsRecord(domain);
            if (!dnsResult.success) throw new Error(`Cloudflare DNS failed: ${dnsResult.error}`);

            // Step 2: Check for and/or Create cPanel Account
            let cpanelUser;
            let cpanelPass = '********';
            log('info', 'Stage: Preparing cPanel Account...');
            
            let shouldCreate = true;
            const checkResult = await whm.checkDomainExists(domain);

            if (checkResult.exists) {
                if (config.forceRecreate) {
                    log('warn', 'cPanel account already exists. Force Recreate is enabled. Terminating account...');
                    const accountInfo = await whm.getAccountInfoByDomain(domain);

                    if (!accountInfo.success || !accountInfo.account) {
                        throw new Error(`Could not find user for domain ${domain} to terminate.`);
                    }
                    
                    const username = accountInfo.account.username;
                    const preTerminationSsh = new SshSession(config.ssh);
                    try {
                        log('info', `Found user ${username}. Running pre-termination steps.`);
                        await preTerminationSsh.connect();
                        await preTerminationSsh.removeNginxConfig(username);
                    } finally {
                        await preTerminationSsh.dispose();
                    }

                    log('info', 'Waiting 3 seconds before WHM termination to allow server processes to close...');
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    const terminateResult = await whm.deleteAccount(username);
                    if (!terminateResult.success) {
                        throw new Error(`Failed to terminate existing account for recreation: ${terminateResult.error}`);
                    }
                    
                    log('info', 'Existing account terminated successfully. Proceeding with creation.');
                    processStateManager.updateProcessInfo(processId, { wasForceRecreated: true });

                } else {
                    log('warn', 'cPanel account already exists. Skipping creation as Force Recreate is disabled.');
                    cpanelUser = '(existing user)';
                    shouldCreate = false;
                }
            }

            if (shouldCreate) {
                const username = domain.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) + Math.random().toString(36).substring(2, 6);
                const password = config.wpPassword;
                const accountDetails = { domain, username, password, plan: 'default' };
                const createResult = await whm.createAccount(accountDetails);
                if (!createResult.success) throw new Error(`cPanel creation failed: ${createResult.error}`);
                cpanelUser = username;
                cpanelPass = password;
            }
            cpanelAccountInfo = { user: cpanelUser, pass: cpanelPass };

            // Connect SSH for all subsequent operations
            await sshSession.connect();

            // Step 3: Perform SSH tasks
            const adsenseIdForHeader = (adsenseIdNumbers && !adsenseIdNumbers.includes('#')) ? adsenseIdNumbers : null;
            let sshResult;
            if (cloneMasterDomain) {
                log('info', 'Stage: Cloning and configuring WordPress...');
                sshResult = await sshSession.runAllInOneSshTasks(domain, config.wpPassword, adsenseIdForHeader, config.masterCloneDomain);
            } else {
                log('info', 'Stage: Configuring WordPress (cloning skipped)...');
                sshResult = await sshSession.runSshTasksWithoutCloning(domain, config.wpPassword, adsenseIdForHeader);
            }

            // Step 4: Create ads.txt
            if (adsenseIdNumbers) {
                log('info', 'Stage: Creating ads.txt file...');
                const adsenseIds = adsenseIdNumbers.split('#');
                const adsTxtContent = adsenseIds.map(id => `google.com, pub-${id}, DIRECT, f08c47fec0942fa0`).join('\n');
                await sshSession.createAdsTxtFile(domain, adsTxtContent);
                log('info', 'ads.txt file created/updated successfully.');
            }

            // Finalize account info
            if (sshResult) {
                if (sshResult.cpanelUser) cpanelAccountInfo.user = sshResult.cpanelUser;
                if (sshResult.adminUsername) cpanelAccountInfo.wpUser = sshResult.adminUsername;
                if (sshResult.magicLink) cpanelAccountInfo.magicLink = sshResult.magicLink;
            }
            cpanelAccountInfo.wpPass = config.wpPassword;

            success = true;
            log('info', 'All operations completed successfully.');
            break; // Exit loop on success

        } catch (error) {
            finalError = error;
            log('warn', `Attempt ${attempt} failed: ${error.message}`);
            if (attempt < maxRetries) {
                log('info', `Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                log('error', `All ${maxRetries} attempts failed. Marking as failed.`);
            }
        } finally {
            await sshSession.dispose();
        }
    }

    // This block runs once after all attempts are exhausted or after a success.
    const currentProgress = processStateManager.getProcessStatus(processId).progress;
    const newProgress = { ...currentProgress, current: currentProgress.current + 1 };

    if (success) {
        newProgress.successful++;
        processState.results.success.push({
            domain: domain,
            adsenseId: adsenseIdNumbers,
            cpanelUser: cpanelAccountInfo.user,
            wpUser: cpanelAccountInfo.wpUser,
            wpPass: cpanelAccountInfo.wpPass,
            magicLink: cpanelAccountInfo.magicLink,
        });
    } else {
        newProgress.failed++;
        const errorMessage = finalError ? finalError.message : 'An unknown error occurred.';
        processState.results.failed.push({
            domain: domain,
            adsenseId: adsenseIdNumbers,
            error: errorMessage,
        });
    }
    
    processStateManager.updateProgress(processId, newProgress);
}

module.exports = {
    validateAllCredentials,
    startAllInOneProcess,
};
