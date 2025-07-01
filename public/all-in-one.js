document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const elements = {
        // WHM / Server
        whmHost: document.getElementById('whm-host'),
        whmUser: document.getElementById('whm-user'),
        whmPassword: document.getElementById('whm-password'),
        // Cloudflare
        cloudflareEmail: document.getElementById('cloudflare-email'),
        cloudflareApiKey: document.getElementById('cloudflare-api-key'),
        cloudflareAccountSelect: document.getElementById('cloudflare-account-select'),
        deleteCloudflareAccountBtn: document.getElementById('delete-cloudflare-account-btn'),
        // Operations
        masterCloneDomain: document.getElementById('master-clone-domain'),
        cloneMasterDomain: document.getElementById('clone-master-domain'),
        forceRecreate: document.getElementById('force-recreate'),
        newWpPassword: document.getElementById('new-wp-password'),
        // Controls
        validateButton: document.getElementById('validate-button'),
        validationStatus: document.getElementById('validation-status'),
        domainList: document.getElementById('domain-list'),
        startProcessButton: document.getElementById('start-process-button'),
        // Monitor
        monitorSection: document.getElementById('monitorSection'),
        progressText: document.getElementById('progressText'),
        progressPercentage: document.getElementById('progressPercentage'),
        progressFill: document.getElementById('progressFill'),
        totalCount: document.getElementById('total-count'),
        successCount: document.getElementById('success-count'),
        failedCount: document.getElementById('failed-count'),
        skippedCount: document.getElementById('skipped-count'),
        logs: document.getElementById('logs'),
        autoScrollLogs: document.getElementById('autoScrollLogs'),
        // Results
        successfulAccountsSection: document.getElementById('successfulAccountsSection'),
        failedAccountsSection: document.getElementById('failedAccountsSection'),
        successResults: document.getElementById('success-results'),
        failedResults: document.getElementById('failed-results'),
        exportSuccessBtn: document.getElementById('export-success-txt'),
        exportFailedBtn: document.getElementById('export-failed-txt'),
    };

    let processId = null;
    let pollingInterval = null;
    let lastLogCount = 0;

    // --- Storage Service for localStorage Management ---
    const StorageService = {
        load(key) {
            try {
                const savedData = localStorage.getItem(key);
                return savedData ? JSON.parse(atob(savedData)) : null;
            } catch (e) { return null; }
        },
        save(key, data) {
            try {
                localStorage.setItem(key, btoa(JSON.stringify(data)));
            } catch (e) { console.error(`Failed to save data for key ${key}:`, e); }
        },
        delete(key, index) {
            const accounts = this.load(key) || [];
            accounts.splice(index, 1);
            this.save(key, accounts);
        }
    };

    // --- Account Setup Functions ---
    function setupCloudflareDropdown() {
        const key = 'bulkCreator_cloudflareAccounts';
        const selectedKey = 'aio_cloudflareSelected'; // Key for saving the selected index
        const selectEl = elements.cloudflareAccountSelect;
        const deleteBtnEl = elements.deleteCloudflareAccountBtn;
        const accounts = StorageService.load(key) || [];
        
        selectEl.innerHTML = '<option value="">Select saved account or enter new</option>';
        accounts.forEach((acc, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = acc.email;
            selectEl.appendChild(option);
        });

        const populateFields = (index) => {
            if (index === '' || index === null) {
                elements.cloudflareEmail.value = '';
                elements.cloudflareApiKey.value = '';
                return;
            }
            const account = accounts[parseInt(index)];
            if (account) {
                elements.cloudflareEmail.value = account.email || '';
                elements.cloudflareApiKey.value = account.apiKey || '';
            }
        };

        const savedIndex = StorageService.load(selectedKey);
        if (savedIndex !== null && selectEl.querySelector(`option[value="${savedIndex}"]`)) {
            selectEl.value = savedIndex;
            populateFields(savedIndex);
        }

        selectEl.addEventListener('change', () => {
            const selectedIndex = selectEl.value;
            StorageService.save(selectedKey, selectedIndex);
            populateFields(selectedIndex);
        });

        deleteBtnEl.addEventListener('click', () => {
            const selectedIndex = selectEl.value;
            if (selectedIndex === '' || !confirm('Are you sure you want to delete this saved Cloudflare account?')) return;
            StorageService.delete(key, parseInt(selectedIndex));
            StorageService.delete(selectedKey);
            setupCloudflareDropdown();
            populateFields('');
        });
    }

    function loadWhmCredentials() {
        const whmData = StorageService.load('bulkCreator_whmConnection');
        if (whmData) {
            elements.whmHost.value = whmData.host || '';
            elements.whmUser.value = whmData.username || '';
            elements.whmPassword.value = whmData.password || '';
        }
    }

    function saveWhmCredentials() {
        const whmData = {
            host: elements.whmHost.value,
            username: elements.whmUser.value,
            password: elements.whmPassword.value,
            ssl: true,
            authMethod: 'password'
        };
        StorageService.save('bulkCreator_whmConnection', whmData);
    }

    function saveOperationDetails() {
        const opDetails = {
            masterCloneDomain: elements.masterCloneDomain.value,
            newWpPassword: elements.newWpPassword.value,
            domainList: elements.domainList.value,
            cloneMasterDomain: elements.cloneMasterDomain.checked,
            forceRecreate: elements.forceRecreate.checked,
        };
        StorageService.save('aio_operationDetails', opDetails);
    }

    function loadOperationDetails() {
        const opDetails = StorageService.load('aio_operationDetails');
        if (opDetails) {
            elements.masterCloneDomain.value = opDetails.masterCloneDomain || '';
            elements.newWpPassword.value = opDetails.newWpPassword || '';
            elements.domainList.value = opDetails.domainList || '';
            elements.cloneMasterDomain.checked = opDetails.hasOwnProperty('cloneMasterDomain') ? opDetails.cloneMasterDomain : true;
            elements.forceRecreate.checked = opDetails.forceRecreate || false;
        }
    }
    
    function saveCloudflareCredentials() {
        const key = 'bulkCreator_cloudflareAccounts';
        const selectedKey = 'aio_cloudflareSelected';
        const accounts = StorageService.load(key) || [];
        const newAccount = { email: elements.cloudflareEmail.value, apiKey: elements.cloudflareApiKey.value };

        if (!newAccount.email || !newAccount.apiKey) return;

        let savedAccountIndex = accounts.findIndex(a => a.email === newAccount.email);

        if (savedAccountIndex > -1) {
            accounts[savedAccountIndex] = newAccount;
        } else {
            accounts.push(newAccount);
            savedAccountIndex = accounts.length - 1;
        }

        StorageService.save(key, accounts);
        StorageService.save(selectedKey, savedAccountIndex); // Save the index of the just-saved account

        setupCloudflareDropdown(); // This will now rebuild the dropdown AND select the correct item
    }

    // --- Event Listeners ---
    ['masterCloneDomain', 'newWpPassword', 'domainList'].forEach(id => {
        elements[id].addEventListener('input', saveOperationDetails);
    });

    elements.cloneMasterDomain.addEventListener('change', saveOperationDetails);
    
    elements.forceRecreate.addEventListener('change', () => {
        if (elements.forceRecreate.checked) {
            elements.cloneMasterDomain.checked = true;
        }
        saveOperationDetails();
    });

    elements.validateButton.addEventListener('click', async () => {
        elements.validationStatus.textContent = 'Validating...';
        elements.validationStatus.className = 'status-message neutral';
        elements.startProcessButton.disabled = true;
        const whmCreds = { host: elements.whmHost.value, username: elements.whmUser.value, password: elements.whmPassword.value };
        const cloudflareCreds = { email: elements.cloudflareEmail.value, apiKey: elements.cloudflareApiKey.value };
        try {
            const response = await fetch('/api/all-in-one/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whm: whmCreds, cloudflare: cloudflareCreds }),
            });
            const result = await response.json();
            if (response.ok && result.success) {
                elements.validationStatus.textContent = 'Validation Successful!';
                elements.validationStatus.className = 'status-message success';
                elements.startProcessButton.disabled = false;
                saveWhmCredentials();
                saveCloudflareCredentials();
            } else {
                throw new Error(result.message || 'Validation failed.');
            }
        } catch (error) {
            elements.validationStatus.textContent = `Validation Failed: ${error.message}`;
            elements.validationStatus.className = 'status-message failure';
        }
    });


    elements.startProcessButton.addEventListener('click', async () => {
        const domains = elements.domainList.value.trim().split('\n').filter(line => line.trim() !== '');
        if (domains.length === 0) return alert('Domain list cannot be empty.');
        const invalidLines = domains.filter(line => !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\|[0-9]+(#\d+)*)?$/.test(line.trim()));
        if (invalidLines.length > 0) return alert(`Invalid format on lines:\n${invalidLines.join('\n')}\nPlease use the format: domain.com|12345#67890`);
        
        disableForm();
        resetUI();

        const config = {
            whm: { host: elements.whmHost.value, username: elements.whmUser.value, password: elements.whmPassword.value },
            cloudflare: { email: elements.cloudflareEmail.value, apiKey: elements.cloudflareApiKey.value },
            wpPassword: elements.newWpPassword.value,
            masterCloneDomain: elements.masterCloneDomain.value,
            cloneMasterDomain: elements.cloneMasterDomain.checked,
            forceRecreate: elements.forceRecreate.checked,
            domains: domains,
        };

        try {
            const response = await fetch('/api/all-in-one/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (!response.ok) throw new Error((await response.json()).message || 'Failed to start.');
            const result = await response.json();
            processId = result.processId;
            elements.monitorSection.classList.remove('hidden');
            elements.totalCount.textContent = domains.length;
            startPolling();
        } catch (error) {
            alert(`Error: ${error.message}`);
            enableForm();
        }
    });

    elements.exportSuccessBtn.addEventListener('click', () => downloadResults(elements.successResults, 'successful_operations.txt'));
    elements.exportFailedBtn.addEventListener('click', () => downloadResults(elements.failedResults, 'failed_operations.txt'));

    // --- Main Functions ---
    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        const poll = async () => {
            if (!processId) return;
            try {
                const [statusRes, logsRes] = await Promise.all([
                    fetch(`/api/process/${processId}/status`),
                    fetch(`/api/process/${processId}/logs`)
                ]);
                if (statusRes.status === 404) {
                    appendLog('Process not found on server.');
                    return stopPolling();
                }
                const statusResult = await statusRes.json();
                const logsResult = await logsRes.json();
                if (statusResult.success && statusResult.data) {
                    const status = statusResult.data;
                    updateProgress(status.progress);
                    if (logsResult.success && logsResult.data.logs) {
                        updateLogs(logsResult.data.logs);
                    }
                    if (status.status === 'completed' || status.status === 'failed') {
                        stopPolling();
                        displayFinalResults(status);
                    }
                }
            } catch (error) {
                appendLog('Error fetching status. Polling stopped.');
                stopPolling();
            }
        };
        pollingInterval = setInterval(poll, 2000);
        poll();
    }

    function stopPolling() {
        clearInterval(pollingInterval);
        pollingInterval = null;
        enableForm();
    }

    function updateProgress(progress) {
        if (!progress) return;
        const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        elements.progressFill.style.width = `${percentage}%`;
        elements.progressPercentage.textContent = `${percentage}%`;
        elements.progressText.textContent = progress.currentItem ? `Processing: ${progress.currentItem}` : 'Initializing...';
        elements.successCount.textContent = progress.successful || 0;
        elements.failedCount.textContent = progress.failed || 0;
        elements.skippedCount.textContent = progress.skipped || 0;
        elements.totalCount.textContent = progress.total || 0;
    }

    function updateLogs(logs) {
        const newLogs = logs.slice(lastLogCount);
        newLogs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.level}`;
            logEntry.textContent = log.message;
            elements.logs.appendChild(logEntry);
        });
        lastLogCount = logs.length;

        if (elements.autoScrollLogs.checked) {
            elements.logs.scrollTop = elements.logs.scrollHeight;
        }
    }

    function displayFinalResults(status) {
        updateLogs(status.logs || []);
        // appendLog('\n--- PROCESS COMPLETE ---'); // Per user request, this is removed to keep logs visible.
        
        const results = status.results || { success: [], failed: [] };
        
        elements.successResults.innerHTML = '';
        elements.failedResults.innerHTML = '';

        if (results.success.length > 0) {
            elements.successfulAccountsSection.classList.remove('hidden');
            results.success.forEach(res => {
                const card = createResultCard(res, true);
                elements.successResults.appendChild(card);
            });
        }
        if (results.failed.length > 0) {
            elements.failedAccountsSection.classList.remove('hidden');
            results.failed.forEach(res => {
                const card = createResultCard(res, false);
                elements.failedResults.appendChild(card);
            });
        }

        document.querySelectorAll('.copy-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const textToCopy = e.currentTarget.getAttribute('data-copy');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    e.currentTarget.textContent = '✓';
                    setTimeout(() => { e.currentTarget.textContent = '📋'; }, 1000);
                });
            });
        });
    }

    function createResultCard(res, isSuccess) {
        const card = document.createElement('div');
        if (isSuccess) {
            const isMagic = res.magicLink && res.magicLink.includes('tlwp-login');
            const loginLabel = isMagic ? 'Magic Login' : 'WP Login';
            const loginClass = isMagic ? 'btn btn-success btn-sm magic-link' : 'btn btn-secondary btn-sm';

            card.className = 'compact-result-card';
            card.innerHTML = `
                <div class="compact-result-info">
                    <span><strong>${res.domain}</strong></span>
                    <span>cPanel: <strong>${res.cpanelUser}</strong></span>
                    <span>WP: <strong>${res.wpUser} / ${res.wpPass}</strong></span>
                </div>
                <a href="${res.magicLink}" target="_blank" class="${loginClass}">${loginLabel}</a>
            `;
        } else {
            card.className = 'compact-result-card'; // Also style failed items
            card.innerHTML = `
                <div class="compact-result-info">
                    <span><strong>${res.domain}</strong></span>
                    <span class="text-red">Error: <strong>${res.error}</strong></span>
                </div>
            `;
        }
        return card;
    }

    function resetUI() {
        elements.monitorSection.classList.add('hidden');
        elements.successfulAccountsSection.classList.add('hidden');
        elements.failedAccountsSection.classList.add('hidden');
        elements.logs.innerHTML = '';
        elements.successResults.innerHTML = '';
        elements.failedResults.innerHTML = '';
        elements.validationStatus.textContent = '';
        lastLogCount = 0; // Reset for new process
    }

    function disableForm() {
        elements.validateButton.disabled = true;
        elements.startProcessButton.disabled = true;
        document.querySelectorAll('#config-form input, #config-form select, #domain-list').forEach(el => el.disabled = true);
    }

    function enableForm() {
        elements.validateButton.disabled = false;
        elements.startProcessButton.disabled = !elements.validationStatus.classList.contains('success');
        document.querySelectorAll('#config-form input, #config-form select, #domain-list').forEach(el => el.disabled = false);
    }

    function appendLog(message) {
        const logEntry = document.createElement('div');
        logEntry.textContent = message;
        elements.logs.appendChild(logEntry);
        elements.logs.scrollTop = elements.logs.scrollHeight;
    }

    function downloadResults(container, fileName) {
        let textContent = '';
        // Try .account-card (success) first
        const accountCards = container.querySelectorAll('.account-card');
        if (accountCards.length > 0) {
            accountCards.forEach(card => {
                const domain = card.querySelector('.account-domain').textContent;
                textContent += `Domain: ${domain}\n`;
                card.querySelectorAll('.detail-row').forEach(row => {
                    const label = row.querySelector('.detail-label').textContent;
                    const value = row.querySelector('.selectable, .detail-value, .login-link')?.textContent.trim();
                    textContent += `${label} ${value}\n`;
                });
                textContent += '-----------------------------------\n';
            });
        } else {
            // Handle .compact-result-card (failed)
            const compactCards = container.querySelectorAll('.compact-result-card');
            compactCards.forEach(card => {
                const domain = card.querySelector('.compact-result-info strong')?.textContent || '';
                const error = card.querySelector('.text-red strong')?.textContent || '';
                textContent += `Domain: ${domain}\n`;
                if (error) textContent += `Error: ${error}\n`;
                textContent += '-----------------------------------\n';
            });
        }
        if (!textContent) return alert('No results to export.');
        
        const blob = new Blob([textContent], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    // --- Initializer ---
    loadWhmCredentials();
    setupCloudflareDropdown();
    loadOperationDetails();
});
