/**
 * cPanel Bulk Delete - Frontend Application
 * Bulk cPanel account deletion with safety confirmation
 */

class CpanelBulkDelete {
    constructor() {
        this.currentProcessId = null;
        this.isProcessing = false;
        this.isWhmConnected = false;
        this.processResults = null;
        this.deletedAccounts = [];
        this.pollingInterval = null;
        this.pollingFrequency = 2000; // 2 seconds
        this.lastLogCount = 0;
        this.clearDataTimeout = null;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadFormDefaults();
        
        // Load saved Cloudflare accounts
        this.populateCloudflareAccountsDropdown();
    }

    /**
     * Get DOM elements and store references
     */
    initializeElements() {
        this.elements = {
            // WHM Configuration
            whmHost: document.getElementById('whmHost'),
            whmPort: document.getElementById('whmPort'),
            whmUsername: document.getElementById('whmUsername'),
            whmSsl: document.getElementById('whmSsl'),
            authMethod: document.getElementById('authMethod'),
            whmApiToken: document.getElementById('whmApiToken'),
            whmPassword: document.getElementById('whmPassword'),
            tokenField: document.getElementById('tokenField'),
            passwordField: document.getElementById('passwordField'),
            testWhmBtn: document.getElementById('testWhmBtn'),
            
            // Cloudflare Configuration (Optional)
            skipCloudflare: document.getElementById('skipCloudflare'),
            cloudflareFields: document.getElementById('cloudflareFields'),
            cfAccountSelect: document.getElementById('cfAccountSelect'),
            deleteCfAccountBtn: document.getElementById('deleteCfAccountBtn'),
            cfEmail: document.getElementById('cfEmail'),
            cfApiKey: document.getElementById('cfApiKey'),
            cfRecordType: document.getElementById('cfRecordType'),
            cfRecordValue: document.getElementById('cfRecordValue'),
            cfValueGroup: document.getElementById('cfValueGroup'),
            cfValueHelp: document.getElementById('cfValueHelp'),
            testCfConnectionBtn: document.getElementById('testCfConnectionBtn'),
            
            // Domain List
            domainList: document.getElementById('domainList'),
            clearDomainsBtn: document.getElementById('clearDomainsBtn'),
            
            // Safety Confirmation
            safetyConfirmation: document.getElementById('safetyConfirmation'),
            domainsToDelete: document.getElementById('domainsToDelete'),
            confirmDeletion: document.getElementById('confirmDeletion'),
            
            // Bulk Deletion
            startDeletionBtn: document.getElementById('startDeletionBtn'),
            stopDeletionBtn: document.getElementById('stopDeletionBtn'),
            
            // Progress Monitor
            monitorSection: document.getElementById('monitorSection'),
            progressText: document.getElementById('progressText'),
            progressPercentage: document.getElementById('progressPercentage'),
            progressFill: document.getElementById('progressFill'),
            processedCount: document.getElementById('processedCount'),
            successCount: document.getElementById('successCount'),
            failedCount: document.getElementById('failedCount'),
            skippedCount: document.getElementById('skippedCount'),
            logsContent: document.getElementById('logsContent'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            
            // Results
            resultsSection: document.getElementById('resultsSection'),
            deletedAccountsCount: document.getElementById('deletedAccountsCount'),
            exportResultsBtn: document.getElementById('exportResultsBtn'),
            resultsList: document.getElementById('resultsList'),
            
            // Common Elements
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            toastContainer: document.getElementById('toastContainer'),
            
            // Status indicator
            statusText: document.querySelector('.status-text'),
            statusDot: document.querySelector('.status-dot')
        };
        
        // Set initial status
        if (this.elements.statusText) {
            this.elements.statusText.textContent = 'Ready';
        }
    }


    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Auth method toggle
        this.elements.authMethod.addEventListener('change', () => this.toggleAuthMethod());
        
        // WHM form changes
        [this.elements.whmHost, this.elements.whmPort, this.elements.whmUsername,
         this.elements.whmApiToken, this.elements.whmPassword].forEach(element => {
            element.addEventListener('input', () => this.validateWhmForm());
        });
        
        // WHM test connection
        this.elements.testWhmBtn.addEventListener('click', () => this.testWhmConnection());
        
        // Skip Cloudflare checkbox
        this.elements.skipCloudflare.addEventListener('change', () => {
            this.toggleCloudflareFields();
            this.saveFormData();
        });
        
        // Cloudflare account management
        this.elements.cfAccountSelect.addEventListener('change', () => this.loadSelectedCloudflareAccount());
        this.elements.deleteCfAccountBtn.addEventListener('click', () => this.deleteSelectedCloudflareAccount());
        
        // Cloudflare form changes (optional)
        [this.elements.cfEmail, this.elements.cfApiKey].forEach(element => {
            element.addEventListener('input', () => this.validateCloudflareFields());
        });
        
        // Cloudflare test connection
        this.elements.testCfConnectionBtn.addEventListener('click', () => this.testCloudflareConnection());
        
        // Domain list
        this.elements.domainList.addEventListener('input', () => {
            this.validateDomainForm();
            this.saveDomainList();
        });
        this.elements.clearDomainsBtn.addEventListener('click', () => this.clearDomainList());
        
        // Safety confirmation
        this.elements.confirmDeletion.addEventListener('change', () => this.validateSafetyForm());
        
        // Bulk deletion
        this.elements.startDeletionBtn.addEventListener('click', () => this.startBulkDeletion());
        this.elements.stopDeletionBtn.addEventListener('click', () => this.stopBulkDeletion());
        
        // Results
        this.elements.exportResultsBtn.addEventListener('click', () => this.exportResults());
        this.elements.clearLogsBtn.addEventListener('click', () => this.clearLogs());
    }

    /**
     * Load form defaults from localStorage
     */
    loadFormDefaults() {
        try {
            const savedWhmData = localStorage.getItem('bulkCreator_whmConnection');
            if (savedWhmData) {
                const whmData = JSON.parse(atob(savedWhmData));
                
                this.elements.whmHost.value = whmData.host || '';
                this.elements.whmPort.value = whmData.port || 2087;
                this.elements.whmUsername.value = whmData.username || '';
                this.elements.whmSsl.value = whmData.ssl ? 'true' : 'false';
                
                if (whmData.apiToken) {
                    this.elements.authMethod.value = 'token';
                    this.elements.whmApiToken.value = whmData.apiToken;
                } else if (whmData.password) {
                    this.elements.authMethod.value = 'password';
                    this.elements.whmPassword.value = whmData.password;
                }
                
                this.toggleAuthMethod();
                this.validateWhmForm();
            }
        } catch (error) {
            console.error('Error loading saved WHM data:', error);
        }
        
        // Load saved Cloudflare data
        try {
            const savedCfData = localStorage.getItem('bulkCreator_cloudflareConnection');
            if (savedCfData) {
                const cfData = JSON.parse(atob(savedCfData));
                
                this.elements.cfEmail.value = cfData.email || '';
                this.elements.cfApiKey.value = cfData.apiKey || '';
                
                this.validateCloudflareFields();
            }
        } catch (error) {
            console.error('Error loading saved Cloudflare data:', error);
        }
        
        // Load saved form data including skipCloudflare
        try {
            const savedFormData = localStorage.getItem('bulkDelete_formData');
            if (savedFormData) {
                const formData = JSON.parse(savedFormData);
                if (formData.skipCloudflare !== undefined) {
                    this.elements.skipCloudflare.checked = formData.skipCloudflare;
                }
            }
        } catch (error) {
            console.error('Error loading saved form data:', error);
        }
        
        // Load saved domain list
        try {
            const savedDomains = localStorage.getItem('bulkDelete_domainList');
            if (savedDomains && this.elements.domainList) {
                this.elements.domainList.value = savedDomains;
                this.validateDomainForm();
            }
        } catch (error) {
            console.error('Error loading saved domain list:', error);
        }
        
        // Initialize toggles
        this.toggleCloudflareFields();
    }

    /**
     * Toggle authentication method fields
     */
    toggleAuthMethod() {
        const isToken = this.elements.authMethod.value === 'token';
        this.elements.tokenField.classList.toggle('hidden', !isToken);
        this.elements.passwordField.classList.toggle('hidden', isToken);
        this.validateWhmForm();
    }

    /**
     * Toggle Cloudflare fields visibility based on skip checkbox
     */
    toggleCloudflareFields() {
        const skipCloudflare = this.elements.skipCloudflare.checked;
        
        if (skipCloudflare) {
            this.elements.cloudflareFields.style.display = 'none';
        } else {
            this.elements.cloudflareFields.style.display = 'grid';
        }
        
        // Clear Cloudflare fields when skipping
        if (skipCloudflare) {
            this.elements.cfEmail.value = '';
            this.elements.cfApiKey.value = '';
            this.elements.cfRecordValue.value = '';
            this.elements.cfAccountSelect.value = '';
        }
        
        this.validateCloudflareFields();
    }

    /**
     * Validate WHM form
     */
    validateWhmForm() {
        const host = this.elements.whmHost.value.trim();
        const username = this.elements.whmUsername.value.trim();
        const isToken = this.elements.authMethod.value === 'token';
        const auth = isToken ? 
            this.elements.whmApiToken.value.trim() : 
            this.elements.whmPassword.value.trim();
        
        const isValid = host && username && auth;
        this.elements.testWhmBtn.disabled = !isValid;
        
        if (isValid) {
            this.saveWhmConnectionData();
        }
        
        return isValid;
    }

    /**
     * Validate domain form
     */
    validateDomainForm() {
        const domains = this.elements.domainList.value.trim();
        const isValid = domains.length > 0 && this.isWhmConnected;
        
        // Enable/disable safety confirmation
        if (isValid) {
            this.showSafetyConfirmation();
        } else {
            this.elements.safetyConfirmation.classList.add('hidden');
        }
        
        return isValid;
    }

    /**
     * Validate safety confirmation form
     */
    validateSafetyForm() {
        const confirmed = this.elements.confirmDeletion.checked;
        const domains = this.elements.domainList.value.trim();
        
        const hasDomains = domains.length > 0;
        
        // Enable button only if confirmation is checked AND there are domains
        this.elements.startDeletionBtn.disabled = !confirmed || !hasDomains;
        
        return confirmed && hasDomains;
    }

    /**
     * Save WHM connection data to localStorage
     */
    saveWhmConnectionData() {
        const whmData = {
            host: this.elements.whmHost.value.trim(),
            port: parseInt(this.elements.whmPort.value) || 2087,
            username: this.elements.whmUsername.value.trim(),
            ssl: this.elements.whmSsl.value === 'true'
        };

        if (this.elements.authMethod.value === 'token') {
            whmData.apiToken = this.elements.whmApiToken.value.trim();
        } else {
            whmData.password = this.elements.whmPassword.value.trim();
        }

        // Simple encoding for localStorage
        const encodedData = btoa(JSON.stringify(whmData));
        localStorage.setItem('bulkCreator_whmConnection', encodedData);
    }

    /**
     * Save domain list to localStorage
     */
    saveDomainList() {
        try {
            const domainList = this.elements.domainList.value;
            localStorage.setItem('bulkDelete_domainList', domainList);
        } catch (error) {
            console.error('Error saving domain list:', error);
        }
    }

    /**
     * Save form data to localStorage
     */
    saveFormData() {
        try {
            const formData = {
                skipCloudflare: this.elements.skipCloudflare.checked
            };
            localStorage.setItem('bulkDelete_formData', JSON.stringify(formData));
        } catch (error) {
            console.error('Error saving form data:', error);
        }
    }

    /**
     * Get WHM credentials from form
     */
    getWhmCredentials() {
        return {
            host: this.elements.whmHost.value.trim(),
            port: parseInt(this.elements.whmPort.value) || 2087,
            username: this.elements.whmUsername.value.trim(),
            ssl: this.elements.whmSsl.value === 'true',
            ...(this.elements.authMethod.value === 'token'
                ? { apiToken: this.elements.whmApiToken.value.trim() }
                : { password: this.elements.whmPassword.value.trim() }
            )
        };
    }

    /**
     * Test WHM connection
     */
    async testWhmConnection() {
        this.showLoading('Testing WHM connection...');
        
        try {
            const credentials = this.getWhmCredentials();
            
            const response = await fetch('/api/whm/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ whmCredentials: credentials })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.isWhmConnected = true;
                this.showToast('success', 'WHM connection successful!');
                this.validateDomainForm();
            } else {
                this.isWhmConnected = false;
                this.showToast('error', `WHM connection failed: ${result.error}`);
            }
        } catch (error) {
            this.isWhmConnected = false;
            this.showToast('error', `Connection error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }


    /**
     * Get Cloudflare credentials
     */
    getCloudflareCredentials() {
        const email = this.elements.cfEmail.value.trim();
        const apiKey = this.elements.cfApiKey.value.trim();
        
        if (!email || !apiKey) {
            return null; // Cloudflare is optional
        }
        
        return {
            email,
            apiKey
        };
    }


    /**
     * Clear domain list
     */
    clearDomainList() {
        this.elements.domainList.value = '';
        this.elements.safetyConfirmation.classList.add('hidden');
        this.validateDomainForm();
        
        // Clear saved domain list from localStorage
        localStorage.removeItem('bulkDelete_domainList');
        this.showToast('info', 'Domain list cleared');
    }


    /**
     * Show safety confirmation section
     */
    showSafetyConfirmation() {
        const domainsText = this.elements.domainList.value.trim();
        if (!domainsText) return;
        
        const domains = domainsText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        // Populate domains to delete list
        this.elements.domainsToDelete.innerHTML = domains
            .map(domain => `<li><strong>${domain}</strong></li>`)
            .join('');

        // Reset confirmation form
        this.elements.confirmDeletion.checked = false;
        
        // Show section
        this.elements.safetyConfirmation.classList.remove('hidden');
        this.validateSafetyForm();
    }

    /**
     * Start bulk deletion
     */
    async startBulkDeletion() {
        if (!this.validateSafetyForm()) {
            this.showToast('warning', 'Please complete all safety confirmations');
            return;
        }

        try {
            this.isProcessing = true;
            this.elements.startDeletionBtn.disabled = true;
            this.elements.stopDeletionBtn.disabled = false;

            // Clear previous data
            this.clearPreviousData();

            const credentials = this.getWhmCredentials();
            const domainsText = this.elements.domainList.value.trim();
            const domains = domainsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Prepare request data
            const requestData = {
                whm: credentials,
                domains: domains
            };

            // Add Cloudflare credentials if not skipped and provided
            const skipCloudflare = this.elements.skipCloudflare.checked;
            if (!skipCloudflare) {
                const cloudflareCredentials = this.getCloudflareCredentials(); // Optional
                if (cloudflareCredentials) {
                    requestData.cloudflare = cloudflareCredentials;
                    this.showToast('info', 'DNS cleanup enabled via Cloudflare');
                }
            } else {
                this.showToast('info', 'Cloudflare DNS cleanup skipped');
            }

            const response = await fetch('/api/bulk/start-deletion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                this.currentProcessId = result.processId;
                this.showToast('success', 'Deletion process started');
                this.elements.monitorSection.classList.remove('hidden');
                this.startPolling();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.isProcessing = false;
            this.elements.startDeletionBtn.disabled = false;
            this.elements.stopDeletionBtn.disabled = true;
            this.showToast('error', `Failed to start deletion: ${error.message}`);
        }
    }

    /**
     * Stop bulk deletion
     */
    async stopBulkDeletion() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/bulk/stop/${this.currentProcessId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('info', 'Deletion process stopped');
                this.stopPolling();
            } else {
                this.showToast('error', `Failed to stop process: ${result.error}`);
            }
        } catch (error) {
            this.showToast('error', `Error stopping process: ${error.message}`);
        }
    }

    /**
     * Start polling for process updates
     */
    startPolling() {
        this.pollingInterval = setInterval(() => {
            this.pollProcessStatus();
        }, this.pollingFrequency);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Poll process status
     */
    async pollProcessStatus() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/bulk/status/${this.currentProcessId}`);
            const result = await response.json();

            if (result.success) {
                this.updateProgress(result.data);
                
                if (result.data.status === 'completed' || result.data.status === 'error') {
                    this.handleProcessCompleted(result.data);
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    /**
     * Update progress display
     */
    updateProgress(data) {
        const percentage = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
        
        this.elements.progressPercentage.textContent = `${percentage}%`;
        this.elements.progressFill.style.width = `${percentage}%`;
        this.elements.progressText.textContent = data.currentDomain || `${data.processed}/${data.total}`;
        
        // Update statistics
        this.elements.processedCount.textContent = data.processed || 0;
        this.elements.successCount.textContent = data.successful || 0;
        this.elements.failedCount.textContent = data.failed || 0;
        this.elements.skippedCount.textContent = data.skipped || 0;
        
        // Add new logs
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                this.addLog(log.level, log.message, log.timestamp);
            });
        }
    }

    /**
     * Handle process completion
     */
    handleProcessCompleted(data) {
        this.stopPolling();
        this.isProcessing = false;
        this.elements.startDeletionBtn.disabled = false;
        this.elements.stopDeletionBtn.disabled = true;
        
        this.addLog('info', 'Bulk deletion process completed successfully!');
        this.addLog('info', `Total processed: ${data.processed || 0}`);
        this.addLog('info', `Successful: ${data.successful || 0}`);
        this.addLog('info', `Failed: ${data.failed || 0}`);
        this.addLog('info', `Skipped: ${data.skipped || 0}`);
        
        this.showToast('success', 'Bulk deletion completed!');
        
        // Load final results
        this.loadProcessResults();
    }

    /**
     * Load process results
     */
    async loadProcessResults() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/bulk/results/${this.currentProcessId}`);
            const result = await response.json();

            if (result.success && result.data.results) {
                this.processResults = result.data;
                this.deletedAccounts = result.data.results.filter(r => r.success);
                this.displayResults();
            }
        } catch (error) {
            console.error('Error loading results:', error);
        }
    }

    /**
     * Display results
     */
    displayResults() {
        if (this.deletedAccounts.length === 0) return;
        
        this.elements.deletedAccountsCount.textContent = this.deletedAccounts.length;
        
        const resultsList = this.elements.resultsList;
        resultsList.innerHTML = this.deletedAccounts.map(account => `
            <div class="account-item">
                <div class="account-header">
                    <h4 class="account-domain">${account.domain}</h4>
                    <span class="account-status">✓ Deleted Successfully</span>
                </div>
                <div class="account-details">
                    <div class="account-info">
                        <div class="info-row">
                            <strong>Domain:</strong>
                            <span class="selectable">${account.domain}</span>
                        </div>
                        <div class="info-row">
                            <strong>Username:</strong>
                            <span class="selectable">${account.username || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <strong>Deletion Time:</strong>
                            <span class="selectable">${account.deletionTime ? new Date(account.deletionTime).toLocaleString() : new Date().toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        this.elements.resultsSection.classList.remove('hidden');
    }

    /**
     * Export results to CSV
     */
    exportResults() {
        if (this.deletedAccounts.length === 0) {
            this.showToast('warning', 'No results to export');
            return;
        }
        
        const headers = ['Domain', 'Username', 'Deletion Time'];
        const rows = [];

        this.deletedAccounts.forEach(account => {
            rows.push([
                account.domain,
                account.username || 'N/A',
                account.deletionTime ? new Date(account.deletionTime).toLocaleString() : new Date().toLocaleString()
            ]);
        });

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deleted-accounts-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('success', 'Results exported to CSV file');
    }

    /**
     * Clear previous data before starting new deletion
     */
    clearPreviousData() {
        // Clear deleted accounts
        this.deletedAccounts = [];
        
        // Hide results section
        this.elements.resultsSection.classList.add('hidden');
        
        // Reset progress bar
        this.updateProgress({ processed: 0, total: 0, successful: 0, failed: 0, skipped: 0 });
        
        // Clear logs
        this.elements.logsContent.innerHTML = '';
        
        // Reset process state
        this.currentProcessId = null;
        this.lastLogCount = 0;
        
        // Show toast notification
        this.showToast('info', 'Previous data cleared. Starting fresh...');
    }

    /**
     * Add log entry to the UI
     */
    addLog(level, message, timestamp = null) {
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        logEntry.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-message">${message}</span>
        `;
        
        this.elements.logsContent.appendChild(logEntry);
        
        // Auto scroll if enabled
        if (document.getElementById('autoScrollLogs').checked) {
            this.elements.logsContent.scrollTop = this.elements.logsContent.scrollHeight;
        }
    }

    /**
     * Clear logs
     */
    clearLogs() {
        this.elements.logsContent.innerHTML = '';
    }

    /**
     * Show loading overlay
     */
    showLoading(text = 'Loading...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.remove('hidden');
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    /**
     * Show toast notification
     */
    showToast(type, message, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Icons for different toast types
        const icons = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>`,
            warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                      </svg>`,
            info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                   </svg>`
        };
        
        toast.innerHTML = `
            ${icons[type] || icons.info}
            <span class="toast-message">${message}</span>
            <button class="toast-close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        `;

        this.elements.toastContainer.appendChild(toast);

        // Close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });

        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('removing');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }, duration);
    }

    /**
     * Validate Cloudflare credentials and enable/disable test button
     */
    validateCloudflareFields() {
        const email = this.elements.cfEmail.value.trim();
        const apiKey = this.elements.cfApiKey.value.trim();
        const isValid = email && apiKey;
        this.elements.testCfConnectionBtn.disabled = !isValid;
        
        // Save Cloudflare connection data whenever valid data is entered
        if (isValid) {
            this.saveCloudflareConnectionData();
        }
    }

    /**
     * Toggle Cloudflare record type UI
     */
    toggleCloudflareRecordType() {
        const recordType = this.elements.cfRecordType.value;
        
        if (recordType === 'A') {
            this.elements.cfRecordValue.placeholder = 'IP Address (e.g., 192.168.1.100)';
            this.elements.cfValueHelp.textContent = 'Enter IP address for A record';
        } else if (recordType === 'CNAME') {
            this.elements.cfRecordValue.placeholder = 'Domain (e.g., target.example.com)';
            this.elements.cfValueHelp.textContent = 'Enter target domain for CNAME record';
        }
    }

    /**
     * Save Cloudflare connection data
     */
    saveCloudflareConnectionData() {
        try {
            const cloudflareData = {
                email: this.elements.cfEmail.value.trim(),
                apiKey: this.elements.cfApiKey.value.trim()
            };
            
            const encodedData = btoa(JSON.stringify(cloudflareData));
            localStorage.setItem('bulkCreator_cloudflareConnection', encodedData);
        } catch (error) {
            console.error('Error saving Cloudflare data:', error);
        }
    }

    /**
     * Load saved Cloudflare accounts
     */
    loadSavedCloudflareAccounts() {
        try {
            const savedAccounts = localStorage.getItem('bulkCreator_cloudflareAccounts');
            if (savedAccounts) {
                return JSON.parse(atob(savedAccounts));
            }
        } catch (error) {
            console.warn('Failed to load saved Cloudflare accounts:', error);
        }
        return [];
    }

    /**
     * Save Cloudflare accounts list
     */
    saveCloudflareAccountsList(accounts) {
        try {
            const encodedData = btoa(JSON.stringify(accounts));
            localStorage.setItem('bulkCreator_cloudflareAccounts', encodedData);
        } catch (error) {
            console.error('Failed to save Cloudflare accounts:', error);
        }
    }

    /**
     * Populate Cloudflare accounts dropdown
     */
    populateCloudflareAccountsDropdown() {
        const accounts = this.loadSavedCloudflareAccounts();
        const select = this.elements.cfAccountSelect;
        
        // Clear existing options except the first one
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add saved accounts
        accounts.forEach((account, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${account.email}`;
            select.appendChild(option);
        });
        
        // Update button visibility
        this.updateCloudflareAccountButtons();
    }

    /**
     * Load selected Cloudflare account
     */
    loadSelectedCloudflareAccount() {
        const selectedIndex = this.elements.cfAccountSelect.value;
        if (selectedIndex === '') {
            this.updateCloudflareAccountButtons();
            return;
        }
        
        const accounts = this.loadSavedCloudflareAccounts();
        const account = accounts[parseInt(selectedIndex)];
        
        if (account) {
            this.elements.cfEmail.value = account.email;
            this.elements.cfApiKey.value = account.apiKey;
            
            // Trigger validation
            this.validateCloudflareFields();
            this.showToast('success', `Loaded account: ${account.email}`);
        }
        
        this.updateCloudflareAccountButtons();
    }

    /**
     * Save current Cloudflare account
     */
    saveCurrentCloudflareAccount(showMessage = true) {
        const email = this.elements.cfEmail.value.trim();
        const apiKey = this.elements.cfApiKey.value.trim();
        
        if (!email || !apiKey) {
            if (showMessage) {
                this.showToast('error', 'Please enter email and API key before saving');
            }
            return;
        }
        
        const newAccount = {
            email,
            apiKey,
            savedAt: new Date().toISOString()
        };
        
        const accounts = this.loadSavedCloudflareAccounts();
        
        // Check if account already exists (by email)
        const existingIndex = accounts.findIndex(acc => acc.email === email);
        if (existingIndex !== -1) {
            // Update existing account
            accounts[existingIndex] = newAccount;
            if (showMessage) {
                this.showToast('success', `Updated account: ${email}`);
            }
        } else {
            // Add new account
            accounts.push(newAccount);
            if (showMessage) {
                this.showToast('success', `Saved new account: ${email}`);
            }
        }
        
        this.saveCloudflareAccountsList(accounts);
        this.populateCloudflareAccountsDropdown();
        
        // Select the saved account in dropdown
        const accountIndex = accounts.findIndex(acc => acc.email === email);
        if (accountIndex !== -1) {
            this.elements.cfAccountSelect.value = accountIndex;
        }
        
        this.updateCloudflareAccountButtons();
    }

    /**
     * Delete selected Cloudflare account
     */
    deleteSelectedCloudflareAccount() {
        const selectedIndex = this.elements.cfAccountSelect.value;
        if (selectedIndex === '') {
            this.showToast('error', 'Please select an account to delete');
            return;
        }
        
        const accounts = this.loadSavedCloudflareAccounts();
        const account = accounts[parseInt(selectedIndex)];
        
        if (account && confirm(`Delete account: ${account.email}?`)) {
            accounts.splice(parseInt(selectedIndex), 1);
            this.saveCloudflareAccountsList(accounts);
            this.populateCloudflareAccountsDropdown();
            
            // Clear form if this was the selected account
            this.elements.cfAccountSelect.value = '';
            this.elements.cfEmail.value = '';
            this.elements.cfApiKey.value = '';
            this.elements.cfRecordValue.value = '';
            
            this.showToast('success', `Deleted account: ${account.email}`);
            this.validateCloudflareFields();
        }
        
        this.updateCloudflareAccountButtons();
    }

    /**
     * Update Cloudflare account management button visibility
     */
    updateCloudflareAccountButtons() {
        const hasSelectedAccount = this.elements.cfAccountSelect.value !== '';
        
        // Show delete button only if account is selected
        this.elements.deleteCfAccountBtn.style.display = hasSelectedAccount ? 'block' : 'none';
    }

    /**
     * Test Cloudflare connection and auto-save if successful
     */
    async testCloudflareConnection() {
        const email = this.elements.cfEmail.value.trim();
        const apiKey = this.elements.cfApiKey.value.trim();

        if (!email || !apiKey) {
            this.showToast('error', 'Please enter Cloudflare email and API key');
            return;
        }

        this.elements.testCfConnectionBtn.disabled = true;
        this.elements.testCfConnectionBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="animate-spin">
                <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z"/>
            </svg>
            Testing...
        `;

        try {
            const response = await fetch('/api/cloudflare/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cloudflareCredentials: {
                        email,
                        apiKey
                    }
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'Cloudflare connection successful! Account saved automatically.');
                
                // Auto-save successful connection
                this.saveCurrentCloudflareAccount(false);
            } else {
                this.showToast('error', `Cloudflare connection failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Cloudflare test error:', error);
            this.showToast('error', 'Failed to test Cloudflare connection');
        } finally {
            this.elements.testCfConnectionBtn.disabled = false;
            this.elements.testCfConnectionBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Test Cloudflare
            `;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CpanelBulkDelete();
});
