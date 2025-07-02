const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const WHMApi = require('../services/whmApi');
const CloudflareApi = require('../services/cloudflareApi');

const router = express.Router();

// Store active deletion processes
const activeProcesses = new Map();


// Start bulk deletion process
router.post('/start-deletion', async (req, res) => {
    try {
        const { whm, domains, cloudflare } = req.body;
        
        if (!whm || !domains || !Array.isArray(domains)) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        
        const processId = uuidv4();
        
        // Initialize process state
        const processInfo = {
            type: 'bulk-deletion',
            domains,
            whm,
            cloudflare: cloudflare || null // Optional
        };
        
        const processState = req.processStateManager.startProcess(processId, processInfo);
        
        // Extended state for deletion processing
        const deletionProcessState = {
            ...processState,
            domains,
            whm,
            cloudflare: cloudflare || null,
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
        
        activeProcesses.set(processId, deletionProcessState);
        
        // Start processing in background
        processBulkDeletion(processId, whm, domains, cloudflare, req.processStateManager);
        
        res.json({
            success: true,
            processId,
            message: 'Bulk deletion process started'
        });
        
    } catch (error) {
        logger.error('Start deletion error:', error);
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

// Get process results
router.get('/results/:processId', (req, res) => {
    try {
        const { processId } = req.params;
        const processState = activeProcesses.get(processId);
        
        if (!processState) {
            return res.status(404).json({
                success: false,
                error: 'Process not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                processId,
                status: processState.status,
                results: processState.results,
                summary: {
                    total: processState.total,
                    processed: processState.processed,
                    successful: processState.successful,
                    failed: processState.failed,
                    skipped: processState.skipped
                }
            }
        });
        
    } catch (error) {
        logger.error('Get results error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main processing function
async function processBulkDeletion(processId, whmConfig, domains, cloudflareConfig, processStateManager) {
    const processState = activeProcesses.get(processId);
    const MAX_CONCURRENT_ACCOUNTS = parseInt(process.env.MAX_CONCURRENT_ACCOUNTS, 10) || 10;
    let activePromises = 0;
    let domainQueue = [...domains];

    try {
        processState.status = 'processing';
        addLog(processState, 'Starting bulk account deletion process with concurrency...', 'info');

        // Initialize Cloudflare API if credentials provided
        let cloudflareApi = null;
        if (cloudflareConfig) {
            cloudflareApi = new CloudflareApi(cloudflareConfig);
            addLog(processState, '🔗 Cloudflare DNS cleanup enabled', 'info');
        }

        const processNext = async () => {
            if (processState.status === 'stopped') {
                addLog(processState, 'Process stopped by user', 'warning');
                return;
            }
            while (domainQueue.length > 0 && activePromises < MAX_CONCURRENT_ACCOUNTS) {
                const domain = domainQueue.shift();
                activePromises++;
                processState.currentDomain = domain;
                addLog(processState, `Processing domain: ${domain}`, 'info');

                (async () => {
                    try {
                        // Use getAccountInfoByDomain for robust lookup
                        const whmApiInstance = new WHMApi(whmConfig);
                        const accountInfoResult = await whmApiInstance.getAccountInfoByDomain(domain);

                        if (!accountInfoResult.success) {
                            processState.failed++;
                            addLog(processState, `✗ Failed to lookup account for: ${domain} - ${accountInfoResult.error}`, 'error');
                            processState.results.push({
                                domain: domain,
                                success: false,
                                error: accountInfoResult.error
                            });
                        } else if (!accountInfoResult.account) {
                            processState.skipped++;
                            addLog(processState, `⏭️ No cPanel account found for domain: ${domain} (skipped)`, 'warning');
                            processState.results.push({
                                domain: domain,
                                success: false,
                                skipped: true,
                                error: 'No cPanel account found for domain (skipped)'
                            });
                        } else {
                            // Delete the account
                            const deleteResult = await whmApiInstance.deleteAccount(accountInfoResult.account.username);
                            if (deleteResult.success) {
                                processState.successful++;
                                addLog(processState, `✓ Successfully deleted account for: ${domain}`, 'success');
                                // Attempt DNS cleanup if Cloudflare is configured
                                let dnsCleanupResult = null;
                                if (cloudflareApi) {
                                    dnsCleanupResult = await deleteDnsRecords(cloudflareApi, domain, processState);
                                }
                                const result = {
                                    domain: domain,
                                    username: accountInfoResult.account.username,
                                    email: accountInfoResult.account.email,
                                    success: true,
                                    deletionTime: new Date().toISOString()
                                };
                                if (dnsCleanupResult) {
                                    result.dnsCleanup = {
                                        success: dnsCleanupResult.success,
                                        recordsDeleted: dnsCleanupResult.recordsDeleted || 0,
                                        errors: dnsCleanupResult.errors || null
                                    };
                                    if (dnsCleanupResult.success && dnsCleanupResult.recordsDeleted > 0) {
                                        addLog(processState, `🧹 DNS cleanup completed for ${domain}: ${dnsCleanupResult.recordsDeleted} record(s) removed`, 'success');
                                    }
                                }
                                processState.results.push(result);
                            } else {
                                processState.failed++;
                                addLog(processState, `✗ Failed to delete account for: ${domain} - ${deleteResult.error}`, 'error');
                                processState.results.push({
                                    domain: domain,
                                    success: false,
                                    error: deleteResult.error
                                });
                            }
                        }
                    } catch (error) {
                        processState.failed++;
                        const errorMsg = `Error deleting account for ${domain}: ${error.message}`;
                        addLog(processState, errorMsg, 'error');
                        processState.results.push({
                            domain: domain,
                            success: false,
                            error: error.message
                        });
                    } finally {
                        processState.processed++;
                        activePromises--;
                        processNext();
                    }
                })();
            }

            // If all domains processed and no active promises, mark as completed
            if (domainQueue.length === 0 && activePromises === 0) {
                processState.status = 'completed';
                processState.completed = true;
                processState.currentDomain = null;

                // Always execute /scripts/updateuserdomains after all bulk deletion is done (via SSH if possible)
                try {
                    const { SshSession } = require('../services/sshService');
                    const sshConfig = processState.whm?.ssh || processState.sshCredentials;
                    if (sshConfig) {
                        addLog(processState, '--- Running /scripts/updateuserdomains ---', 'info');
                        const sshSessionUpdate = new SshSession(sshConfig);
                        await sshSessionUpdate.connect();
                        const updateResult = await sshSessionUpdate.ssh.execCommand('/scripts/updateuserdomains');
                        if (updateResult.code === 0) {
                            addLog(processState, '/scripts/updateuserdomains executed successfully.', 'info');
                        } else {
                            addLog(processState, `/scripts/updateuserdomains failed. STDOUT: ${updateResult.stdout || 'N/A'}, STDERR: ${updateResult.stderr || 'N/A'}`, 'error');
                        }
                        await sshSessionUpdate.dispose();
                    } else {
                        addLog(processState, 'SSH credentials not provided. Skipping /scripts/updateuserdomains execution.', 'warn');
                    }
                } catch (e) {
                    addLog(processState, `Error running /scripts/updateuserdomains: ${e.message}`, 'error');
                }

                addLog(processState, `Process completed: ${processState.successful} deleted, ${processState.failed} failed, ${processState.skipped} skipped`, 'info');
            }
        };

        processNext();

    } catch (error) {
        processState.status = 'error';
        processState.error = error.message;
        processState.completed = true;
        addLog(processState, `Fatal error: ${error.message}`, 'error');
        logger.error('Bulk deletion process error:', error);
    } finally {
        // Clean up process after some time
        setTimeout(() => {
            activeProcesses.delete(processId);
            if (processStateManager) {
                processStateManager.deleteProcess(processId);
            }
        }, 300000); // 5 minutes
    }
}

// Delete DNS records from Cloudflare
async function deleteDnsRecords(cloudflareApi, domain, processState) {
    try {
        addLog(processState, `🔍 Checking DNS records for ${domain}`, 'info');
        
        // Get the zone for the domain
        const zoneResult = await cloudflareApi.getZoneByDomain(domain);
        if (!zoneResult.success) {
            addLog(processState, `⚠️ Zone not found for ${domain}: ${zoneResult.error}`, 'warning');
            return {
                success: false,
                error: zoneResult.error
            };
        }
        
        const zone = zoneResult.data.zone;
        
        // Get existing DNS records for this domain
        const existingRecords = await cloudflareApi.getDnsRecords(zone.id, domain);
        if (!existingRecords.success) {
            addLog(processState, `⚠️ Could not check DNS records for ${domain}: ${existingRecords.error}`, 'warning');
            return {
                success: false,
                error: existingRecords.error
            };
        }
        
        if (existingRecords.data.length === 0) {
            addLog(processState, `✓ No DNS records found for ${domain}`, 'info');
            return {
                success: true,
                recordsDeleted: 0
            };
        }
        
        // Delete all DNS records for this domain
        let deletedCount = 0;
        let errors = [];
        
        addLog(processState, `🗑️ Found ${existingRecords.data.length} DNS record(s) for ${domain}, deleting...`, 'info');
        
        for (const record of existingRecords.data) {
            const deleteResult = await cloudflareApi.deleteDnsRecord(zone.id, record.id);
            if (deleteResult.success) {
                deletedCount++;
                addLog(processState, `🗑️ Deleted ${record.type} record: ${record.name} -> ${record.content} (ID: ${record.id})`, 'info');
            } else {
                errors.push(`Failed to delete record ${record.id}: ${deleteResult.error}`);
                addLog(processState, `❌ Failed to delete ${record.type} record ${record.id}: ${deleteResult.error}`, 'error');
            }
        }
        
        if (deletedCount > 0) {
            addLog(processState, `✅ Successfully deleted ${deletedCount} DNS record(s) for ${domain}`, 'success');
        }
        
        if (errors.length > 0) {
            addLog(processState, `⚠️ Some DNS record deletions failed for ${domain}`, 'warning');
        }
        
        return {
            success: deletedCount > 0,
            recordsDeleted: deletedCount,
            errors: errors.length > 0 ? errors : null
        };
        
    } catch (error) {
        addLog(processState, `❌ DNS cleanup error for ${domain}: ${error.message}`, 'error');
        return {
            success: false,
            error: error.message
        };
    }
}

// Delete account by domain
async function deleteAccountByDomain(whmConfig, domain, cloudflareApi, processState) {
    try {
        addLog(processState, `Attempting to find and delete account for domain: ${domain}`, 'info');
        
        // Create WHM API instance
        const whmApiInstance = new WHMApi(whmConfig);
        
        // First, try to find the account by searching for the domain
        const accountList = await whmApiInstance.listAccounts(domain);
        
        if (!accountList || !accountList.success || !accountList.accounts || accountList.accounts.length === 0) {
            throw new Error(`No cPanel account found for domain: ${domain}`);
        }
        
        // Find the account that matches the domain
        const account = accountList.accounts.find(acc =>
            acc.domain === domain ||
            (acc.addon_domains && acc.addon_domains.includes(domain)) ||
            (acc.parked_domains && acc.parked_domains.includes(domain))
        );
        
        if (!account) {
            throw new Error(`Domain ${domain} not found in any cPanel account`);
        }
        
        addLog(processState, `Found account: ${account.username} for domain: ${domain}`, 'info');
        
        // Delete the account
        const deleteResult = await whmApiInstance.deleteAccount(account.username);
        
        if (deleteResult.success) {
            addLog(processState, `✅ cPanel account deleted successfully: ${account.username} (${domain})`, 'success');
            
            // Attempt DNS cleanup if Cloudflare is configured
            let dnsCleanupResult = null;
            if (cloudflareApi) {
                dnsCleanupResult = await deleteDnsRecords(cloudflareApi, domain, processState);
            }
            
            const result = {
                domain: domain,
                username: account.username,
                email: account.email,
                success: true,
                deletionTime: new Date().toISOString()
            };
            
            // Add DNS cleanup results if performed
            if (dnsCleanupResult) {
                result.dnsCleanup = {
                    success: dnsCleanupResult.success,
                    recordsDeleted: dnsCleanupResult.recordsDeleted || 0,
                    errors: dnsCleanupResult.errors || null
                };
                
                if (dnsCleanupResult.success && dnsCleanupResult.recordsDeleted > 0) {
                    addLog(processState, `🧹 DNS cleanup completed for ${domain}: ${dnsCleanupResult.recordsDeleted} record(s) removed`, 'success');
                }
            }
            
            return result;
        } else {
            throw new Error(deleteResult.error || 'Unknown deletion error');
        }
        
    } catch (error) {
        addLog(processState, `Failed to delete account for ${domain}: ${error.message}`, 'error');
        
        return {
            domain: domain,
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
