const WHMApi = require('./whmApi');
const CloudflareApi = require('./cloudflareApi');
const sshService = require('./sshService');

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
            sshService.validateSshCredentials(sshConfig),
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

    // Instantiate APIs once for the entire process
    const whm = new WHMApi(config.whm);
    const cloudflare = new CloudflareApi(config.cloudflare);

    const processNext = async () => {
        if (domainQueue.length === 0 && activePromises === 0) {
            const finalState = processStateManager.getProcessStatus(processId);
            processStateManager.completeProcess(processId, finalState.results);
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
 * Processes a single domain through all the required steps.
 * @param {string} processId - The unique ID for this process.
 * @param {string} domainEntry - The domain string, e.g., "domain.com|1234567890"
 * @param {object} config - The configuration object.
 * @param {WHMApi} whm - Instantiated WHM API client.
 * @param {CloudflareApi} cloudflare - Instantiated Cloudflare API client.
 * @param {ProcessStateManager} processStateManager - The shared process state manager instance.
 */
async function processDomain(processId, domainEntry, config, whm, cloudflare, processStateManager) {
    const [domain, adsenseIdNumbers] = domainEntry.split('|');
    const processState = processStateManager.getProcessStatus(processId);

    const log = (level, message, data = {}) => {
        processStateManager.addLog(processId, { level, message: `[${domain}] ${message}`, data });
    };

    let success = false;
    let cpanelAccountInfo = {};
    let finalError = null;

    try {
        log('info', 'Processing started...');
        processStateManager.updateProgress(processId, { ...processState.progress, currentItem: domain });

        // Step 1: Add DNS record to Cloudflare
        log('info', 'Stage: Configuring DNS...');
        cloudflare.recordValue = config.whm.host;
        const dnsResult = await cloudflare.addOrUpdateDnsRecord(domain);
        if (!dnsResult.success) {
            throw new Error(`Cloudflare DNS failed: ${dnsResult.error}`);
        }

        // Step 2: Check for and/or Create cPanel Account
        let cpanelUser;
        let cpanelPass = '********'; // Default password placeholder
        log('info', 'Stage: Preparing cPanel Account...');
        const checkResult = await whm.checkDomainExists(domain);
        if (checkResult.exists) {
            log('warn', 'cPanel account already exists. Skipping creation.');
            cpanelUser = '(existing user)';
        } else {
            const username = domain.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) + Math.random().toString(36).substring(2, 6);
            const password = Math.random().toString(36).slice(-10) + 'A1!';
            const accountDetails = { domain, username, password, plan: 'default' };
            
            const createResult = await whm.createAccount(accountDetails);
            if (!createResult.success) {
                throw new Error(`cPanel creation failed: ${createResult.error}`);
            }
            cpanelUser = username;
            cpanelPass = password;
        }
        cpanelAccountInfo = { user: cpanelUser, pass: cpanelPass };

        // Step 3: Perform SSH tasks (Clone, WP Password, AdSense)
        log('info', 'Stage: Cloning and configuring WordPress...');
        const sshResult = await sshService.runAllInOneSshTasks(config.ssh, domain, config.wpPassword, adsenseIdNumbers, config.masterCloneDomain);
        
        // Step 4: Create ads.txt if requested
        if (config.createAdsTxt && config.adsTxtContent) {
            log('info', 'Stage: Creating ads.txt file...');
            await sshService.createAdsTxtFile(config.ssh, domain, config.adsTxtContent);
            log('info', 'ads.txt file created/updated successfully.');
        }

        // Update the cpanel user info with the one discovered by the SSH script, if it exists
        if (sshResult && sshResult.cpanelUser) {
            cpanelAccountInfo.user = sshResult.cpanelUser;
        }
        if (sshResult && sshResult.adminUsername) {
            cpanelAccountInfo.wpUser = sshResult.adminUsername;
        }
        if (sshResult && sshResult.magicLink) {
            cpanelAccountInfo.magicLink = sshResult.magicLink;
        }
        cpanelAccountInfo.wpPass = config.wpPassword;


        success = true;
        log('info', 'All operations completed successfully.');

    } catch (error) {
        finalError = error;
        log('error', `Operation failed: ${error.message}`, { error: error.stack });
    } finally {
        const currentProgress = processStateManager.getProcessStatus(processId).progress;
        const newProgress = { ...currentProgress, current: currentProgress.current + 1 };

        if (success) {
            newProgress.successful++;
            const resultObject = {
                domain: domain,
                adsenseId: adsenseIdNumbers,
                cpanelUser: cpanelAccountInfo.user,
                // cpanelPass is intentionally omitted as per user request
                wpUser: cpanelAccountInfo.wpUser,
                wpPass: cpanelAccountInfo.wpPass,
                magicLink: cpanelAccountInfo.magicLink,
            };
            processState.results.success.push(resultObject);
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
}

module.exports = {
    validateAllCredentials,
    startAllInOneProcess,
};
