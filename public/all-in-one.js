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
        selectEl.addEventListener('change', () => {
            const selectedIndex = selectEl.value;
            if (selectedIndex === '') {
                elements.cloudflareEmail.value = '';
                elements.cloudflareApiKey.value = '';
                return;
            }
            const account = accounts[parseInt(selectedIndex)];
            if (account) {
                elements.cloudflareEmail.value = account.email || '';
                elements.cloudflareApiKey.value = account.apiKey || '';
            }
        });
        deleteBtnEl.addEventListener('click', () => {
            const selectedIndex = selectEl.value;
            if (selectedIndex === '' || !confirm('Are you sure you want to delete this saved Cloudflare account?')) return;
            StorageService.delete(key, parseInt(selectedIndex));
            setupCloudflareDropdown();
            elements.cloudflareEmail.value = '';
            elements.cloudflareApiKey.value = '';
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
        };
        StorageService.save('aio_operationDetails', opDetails);
    }

    function loadOperationDetails() {
        const opDetails = StorageService.load('aio_operationDetails');
        if (opDetails) {
            elements.masterCloneDomain.value = opDetails.masterCloneDomain || '';
            elements.newWpPassword.value = opDetails.newWpPassword || '';
            elements.domainList.value = opDetails.domainList || '';
        }
    }
    
    function saveCloudflareCredentials() {
        const key = 'bulkCreator_cloudflareAccounts';
        const accounts = StorageService.load(key) || [];
        const newAccount = { email: elements.cloudflareEmail.value, apiKey: elements.cloudflareApiKey.value };
        const existingIndex = accounts.findIndex(a => a.email === newAccount.email);
        if (existingIndex > -1) {
            accounts[existingIndex] = newAccount;
        } else {
            accounts.push(newAccount);
        }
        StorageService.save(key, accounts);
        setupCloudflareDropdown();
    }

    // --- Event Listeners ---
    ['masterCloneDomain', 'newWpPassword', 'domainList'].forEach(id => {
        elements[id].addEventListener('input', saveOperationDetails);
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
        const invalidLines = domains.filter(line => !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\|[0-9]{16}$/.test(line.trim()));
        if (invalidLines.length > 0) return alert(`Invalid format on lines:\n${invalidLines.join('\n')}\nPlease use the format: domain.com|1234567890123456 (AdSense ID must be 16 digits)`);
        
        disableForm();
        resetUI();

        const config = {
            whm: { host: elements.whmHost.value, username: elements.whmUser.value, password: elements.whmPassword.value },
            cloudflare: { email: elements.cloudflareEmail.value, apiKey: elements.cloudflareApiKey.value },
            wpPassword: elements.newWpPassword.value,
            masterCloneDomain: elements.masterCloneDomain.value,
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
        elements.logs.innerHTML = '';
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.level}`;
            logEntry.textContent = log.message;
            elements.logs.appendChild(logEntry);
        });
        if (elements.autoScrollLogs.checked) {
            elements.logs.scrollTop = elements.logs.scrollHeight;
        }
    }

    function displayFinalResults(status) {
        updateLogs(status.logs || []);
        appendLog('\n--- PROCESS COMPLETE ---');
        
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
        card.className = `account-card ${isSuccess ? 'success' : 'failed'}`;
        if (isSuccess) {
            card.innerHTML = `
                <div class="account-header"><h4 class="account-domain">${res.domain}</h4><span class="account-status status-success">✓ Success</span></div>
                <div class="account-details">
                    <div class="detail-row"><span class="detail-label">cPanel User:</span><span class="selectable">${res.cpanelUser}</span><button class="copy-btn" data-copy="${res.cpanelUser}">📋</button></div>
                    <div class="detail-row"><span class="detail-label">cPanel Pass:</span><span class="selectable password-field">${res.cpanelPass}</span><button class="copy-btn" data-copy="${res.cpanelPass}">📋</button></div>
                    <div class="detail-row"><span class="detail-label">WP User:</span><span class="selectable">${res.wpUser}</span><button class="copy-btn" data-copy="${res.wpUser}">📋</button></div>
                    <div class="detail-row"><span class="detail-label">WP Pass:</span><span class="selectable password-field">${res.wpPass}</span><button class="copy-btn" data-copy="${res.wpPass}">📋</button></div>
                    <div class="detail-row"><span class="detail-label">WP Login:</span><a href="https://${res.domain}/wp-admin/" target="_blank" class="login-link">https://${res.domain}/wp-admin/</a></div>
                </div>`;
        } else {
            card.innerHTML = `
                <div class="account-header"><h4 class="account-domain">${res.domain}</h4><span class="account-status status-error">✗ Failed</span></div>
                <div class="account-details"><div class="detail-row error"><span class="detail-label">Error:</span><span class="detail-value">${res.error}</span></div></div>`;
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
        container.querySelectorAll('.account-card').forEach(card => {
            const domain = card.querySelector('.account-domain').textContent;
            textContent += `Domain: ${domain}\n`;
            card.querySelectorAll('.detail-row').forEach(row => {
                const label = row.querySelector('.detail-label').textContent;
                const value = row.querySelector('.selectable, .detail-value, .login-link')?.textContent.trim();
                textContent += `${label} ${value}\n`;
            });
            textContent += '-----------------------------------\n';
        });
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
