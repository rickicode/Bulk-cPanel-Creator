/**
 * WordPress Admin Changer - Frontend Application (REST API Version)
 * Uses REST API polling instead of websockets, matching index.html functionality
 */

class WordPressAdminChanger {
    constructor() {
        this.currentProcessId = null;
        this.isProcessing = false;
        this.validationResults = null;
        this.processResults = null;
        this.successfulChanges = [];
        this.pollingInterval = null;
        this.pollingFrequency = 2000; // 2 seconds
        this.lastLogCount = 0;
        this.clearDataTimeout = null; // For debouncing clear data action
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadFormDefaults();
    }


    /**
     * Get DOM elements and store references
     */
    initializeElements() {
        this.elements = {
            // SSH Credentials
            sshHost: document.getElementById('sshHost'),
            sshPort: document.getElementById('sshPort'),
            sshUsername: document.getElementById('sshUsername'),
            sshPassword: document.getElementById('sshPassword'),
            
            // WordPress Config
            newWpPassword: document.getElementById('newWpPassword'),
            showPassword: document.getElementById('showPassword'),
            
            // Domains
            domainList: document.getElementById('domainList'),
            
            // Buttons
            testSshConnectionBtn: document.getElementById('testSshConnectionBtn'),
            validateDomainsBtn: document.getElementById('validateDomainsBtn'),
            clearDomainsBtn: document.getElementById('clearDomainsBtn'),
            startChangingBtn: document.getElementById('startChangingBtn'),
            stopChangingBtn: document.getElementById('stopChangingBtn'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            exportResultsBtn: document.getElementById('exportResultsBtn'),
            
            // Domain validation
            domainValidation: document.getElementById('domainValidation'),
            totalDomains: document.getElementById('totalDomains'),
            validDomains: document.getElementById('validDomains'),
            invalidDomains: document.getElementById('invalidDomains'),
            duplicateDomains: document.getElementById('duplicateDomains'),
            invalidList: document.getElementById('invalidList'),
            invalidDomainsUl: document.getElementById('invalidDomainsUl'),
            duplicateList: document.getElementById('duplicateList'),
            duplicateDomainsUl: document.getElementById('duplicateDomainsUl'),
            
            // Progress monitoring
            monitorSection: document.getElementById('monitorSection'),
            progressText: document.getElementById('progressText'),
            progressPercentage: document.getElementById('progressPercentage'),
            progressFill: document.getElementById('progressFill'),
            processedCount: document.getElementById('processedCount'),
            successCount: document.getElementById('successCount'),
            failedCount: document.getElementById('failedCount'),
            skippedCount: document.getElementById('skippedCount'),
            
            // Logs
            logsContent: document.getElementById('logsContent'),
            autoScrollLogs: document.getElementById('autoScrollLogs'),
            
            // Results
            resultsSection: document.getElementById('resultsSection'),
            successfulChangesCount: document.getElementById('successfulChangesCount'),
            resultsList: document.getElementById('resultsList'),
            
            // UI Elements
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            toastContainer: document.getElementById('toastContainer'),
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // SSH credential field changes
        [this.elements.sshHost, this.elements.sshPort, this.elements.sshUsername, this.elements.sshPassword].forEach(element => {
            if (element) {
                element.addEventListener('input', () => {
                    this.validateSshFields();
                });
            }
        });

        // WordPress config field changes
        if (this.elements.newWpPassword) {
            this.elements.newWpPassword.addEventListener('input', () => {
                this.validateWordPressFields();
                this.updateStartButtonState();
            });
        }

        // Show/hide password toggle
        if (this.elements.showPassword) {
            this.elements.showPassword.addEventListener('change', (e) => {
                this.elements.newWpPassword.type = e.target.checked ? 'text' : 'password';
            });
        }

        // Domain field changes
        if (this.elements.domainList) {
            this.elements.domainList.addEventListener('input', () => {
                this.validateDomainFields();
            });
        }

        // Button clicks
        if (this.elements.testSshConnectionBtn) {
            this.elements.testSshConnectionBtn.addEventListener('click', () => {
                this.testSshConnection();
            });
        }

        if (this.elements.validateDomainsBtn) {
            this.elements.validateDomainsBtn.addEventListener('click', () => {
                this.validateDomains();
            });
        }

        if (this.elements.clearDomainsBtn) {
            this.elements.clearDomainsBtn.addEventListener('click', () => {
                this.clearDomains();
            });
        }

        if (this.elements.startChangingBtn) {
            this.elements.startChangingBtn.addEventListener('click', () => {
                this.startWordPressChange();
            });
        }

        if (this.elements.stopChangingBtn) {
            this.elements.stopChangingBtn.addEventListener('click', () => {
                this.stopWordPressChange();
            });
        }

        if (this.elements.clearLogsBtn) {
            this.elements.clearLogsBtn.addEventListener('click', () => {
                this.clearLogs();
            });
        }

        if (this.elements.exportResultsBtn) {
            this.elements.exportResultsBtn.addEventListener('click', () => {
                this.exportResults();
            });
        }

        // Auto-scroll logs
        if (this.elements.autoScrollLogs) {
            this.elements.autoScrollLogs.addEventListener('change', () => {
                if (this.elements.autoScrollLogs.checked) {
                    this.scrollLogsToBottom();
                }
            });
        }
    }

    /**
     * Load form defaults from localStorage
     */
    loadFormDefaults() {
        try {
            const saved = localStorage.getItem('wordpressChangerConfig');
            if (saved) {
                const config = JSON.parse(saved);
                
                // Load SSH settings - INCLUDING PASSWORD
                if (config.ssh) {
                    if (this.elements.sshHost) this.elements.sshHost.value = config.ssh.host || '';
                    if (this.elements.sshPort) this.elements.sshPort.value = config.ssh.port || 22;
                    if (this.elements.sshUsername) this.elements.sshUsername.value = config.ssh.username || '';
                    if (this.elements.sshPassword) this.elements.sshPassword.value = config.ssh.password || '';
                }
                
                // Load WordPress settings - INCLUDING PASSWORD
                if (config.wordpress) {
                    if (this.elements.newWpPassword) this.elements.newWpPassword.value = config.wordpress.newPassword || '';
                    if (this.elements.showPassword) this.elements.showPassword.checked = config.wordpress.showPassword || false;
                    
                    // Apply show/hide password state
                    if (this.elements.showPassword.checked) {
                        this.elements.newWpPassword.type = 'text';
                    }
                }
                
                // Load domain list
                if (config.domains && this.elements.domainList) {
                    this.elements.domainList.value = config.domains.join('\n');
                }
            }
        } catch (error) {
            console.error('Error loading saved config:', error);
        }
        
        // Validate fields after loading
        this.validateSshFields();
        this.validateWordPressFields();
        this.validateDomainFields();
    }

    /**
     * Save form data to localStorage - INCLUDING ALL PASSWORDS
     */
    saveFormData() {
        try {
            const config = {
                ssh: {
                    host: this.elements.sshHost?.value || '',
                    port: parseInt(this.elements.sshPort?.value) || 22,
                    username: this.elements.sshUsername?.value || '',
                    password: this.elements.sshPassword?.value || '' // SAVE PASSWORD
                },
                wordpress: {
                    newPassword: this.elements.newWpPassword?.value || '', // SAVE PASSWORD
                    showPassword: this.elements.showPassword?.checked || false
                },
                domains: this.getDomainList()
            };
            
            localStorage.setItem('wordpressChangerConfig', JSON.stringify(config));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    /**
     * Validate SSH credential fields and enable/disable test button
     */
    validateSshFields() {
        const host = this.elements.sshHost?.value.trim() || '';
        const username = this.elements.sshUsername?.value.trim() || '';
        const password = this.elements.sshPassword?.value || '';

        const isValid = host && username && password;
        
        if (this.elements.testSshConnectionBtn) {
            this.elements.testSshConnectionBtn.disabled = !isValid;
        }
        
        this.updateStartButtonState();
        this.saveFormData();
    }

    /**
     * Validate WordPress credential fields
     */
    validateWordPressFields() {
        const newPassword = this.elements.newWpPassword?.value || '';
        
        this.updateStartButtonState();
        return !!newPassword;
    }

    /**
     * Validate domain fields and enable/disable related buttons
     */
    validateDomainFields() {
        const domains = this.elements.domainList?.value.trim() || '';
        
        if (this.elements.validateDomainsBtn) {
            this.elements.validateDomainsBtn.disabled = !domains;
        }
        
        this.updateStartButtonState();
        this.saveFormData();
    }

    /**
     * Update start button state based on all requirements
     */
    updateStartButtonState() {
        const hasSshCredentials = !!(this.elements.sshHost?.value.trim() && 
                                    this.elements.sshUsername?.value.trim() && 
                                    this.elements.sshPassword?.value);
        const hasWpPassword = !!(this.elements.newWpPassword?.value);
        const hasValidDomains = this.validationResults && this.validationResults.valid.length > 0;
        
        if (this.elements.startChangingBtn) {
            this.elements.startChangingBtn.disabled = !hasSshCredentials || !hasWpPassword || !hasValidDomains || this.isProcessing;
        }
    }

    /**
     * Get domain list from textarea
     */
    getDomainList() {
        const domainText = this.elements.domainList?.value || '';
        return domainText.split('\n')
            .map(domain => domain.trim())
            .filter(domain => domain.length > 0);
    }

    /**
     * Get SSH credentials
     */
    getSshCredentials() {
        return {
            host: this.elements.sshHost?.value.trim() || '',
            port: parseInt(this.elements.sshPort?.value) || 22,
            username: this.elements.sshUsername?.value.trim() || '',
            password: this.elements.sshPassword?.value || ''
        };
    }

    /**
     * Test SSH connection
     */
    async testSshConnection() {
        const credentials = this.getSshCredentials();
        
        if (!credentials.host || !credentials.username || !credentials.password) {
            this.showToast('error', 'Please fill in all SSH credentials');
            return;
        }

        this.showLoading('Testing SSH connection...');

        try {
            const response = await fetch('/api/wordpress/test-ssh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', 'SSH connection successful!');
                this.addLog('info', 'SSH connection test passed');
            } else {
                this.showToast('error', `SSH connection failed: ${result.error}`);
                this.addLog('error', `SSH connection failed: ${result.error}`);
            }

        } catch (error) {
            console.error('SSH test error:', error);
            this.showToast('error', 'Failed to test SSH connection');
            this.addLog('error', `SSH connection test error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Validate domains
     */
    async validateDomains() {
        const domains = this.getDomainList();
        
        if (domains.length === 0) {
            this.showToast('error', 'Please enter domains first');
            return;
        }

        this.showLoading('Validating domains...');

        try {
            const response = await fetch('/api/bulk/validate-domains', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains })
            });

            const result = await response.json();

            if (result.success) {
                this.validationResults = result.data;
                this.displayValidationResults(result.data);
                this.updateStartButtonState();
                this.showToast('success', `Validation complete: ${result.data.summary.validCount} valid domains`);
            } else {
                this.showToast('error', `Validation failed: ${result.error}`);
            }

        } catch (error) {
            console.error('Domain validation error:', error);
            this.showToast('error', 'Failed to validate domains');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Display validation results
     */
    displayValidationResults(data) {
        // Show validation section
        if (this.elements.domainValidation) {
            this.elements.domainValidation.classList.remove('hidden');
        }
        
        // Update counts
        if (this.elements.totalDomains) this.elements.totalDomains.textContent = data.total;
        if (this.elements.validDomains) this.elements.validDomains.textContent = data.summary.validCount;
        if (this.elements.invalidDomains) this.elements.invalidDomains.textContent = data.summary.invalidCount;
        if (this.elements.duplicateDomains) this.elements.duplicateDomains.textContent = data.summary.duplicateCount;
        
        // Show/hide invalid domains list
        if (data.invalid.length > 0 && this.elements.invalidList && this.elements.invalidDomainsUl) {
            this.elements.invalidList.classList.remove('hidden');
            this.elements.invalidDomainsUl.innerHTML = '';
            data.invalid.forEach(domain => {
                const li = document.createElement('li');
                li.textContent = domain;
                this.elements.invalidDomainsUl.appendChild(li);
            });
        } else if (this.elements.invalidList) {
            this.elements.invalidList.classList.add('hidden');
        }
        
        // Show/hide duplicate domains list
        if (data.duplicates.length > 0 && this.elements.duplicateList && this.elements.duplicateDomainsUl) {
            this.elements.duplicateList.classList.remove('hidden');
            this.elements.duplicateDomainsUl.innerHTML = '';
            data.duplicates.forEach(domain => {
                const li = document.createElement('li');
                li.textContent = domain;
                this.elements.duplicateDomainsUl.appendChild(li);
            });
        } else if (this.elements.duplicateList) {
            this.elements.duplicateList.classList.add('hidden');
        }
    }

    /**
     * Clear domains input and validation
     */
    clearDomains() {
        if (this.elements.domainList) {
            this.elements.domainList.value = '';
        }
        if (this.elements.domainValidation) {
            this.elements.domainValidation.classList.add('hidden');
        }
        
        this.validationResults = null;
        this.updateStartButtonState();
        
        // Clear previous process data
        if (this.currentProcessId || this.successfulChanges.length > 0) {
            this.clearPreviousData();
            this.showToast('info', 'Domains and previous data cleared');
        } else {
            this.showToast('info', 'Domains cleared');
        }
        
        this.saveFormData();
    }

    /**
     * Start WordPress admin change process
     */
    async startWordPressChange() {
        if (!this.validationResults || this.validationResults.valid.length === 0) {
            this.showToast('error', 'Please validate domains first');
            return;
        }

        const sshCredentials = this.getSshCredentials();
        const newPassword = this.elements.newWpPassword?.value || '';

        if (!sshCredentials.host || !sshCredentials.username || !sshCredentials.password) {
            this.showToast('error', 'Please fill in all SSH credentials');
            return;
        }

        if (!newPassword) {
            this.showToast('error', 'Please enter a new WordPress password');
            return;
        }

        // Clear previous data before starting new process
        this.clearPreviousData();

        this.showLoading('Starting WordPress admin change...');
        
        try {
            const requestData = {
                ssh: sshCredentials,
                wordpress: {
                    newPassword: newPassword
                },
                domains: this.validationResults.valid
            };

            const response = await fetch('/api/wordpress/start-changing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                this.currentProcessId = result.processId;
                this.isProcessing = true;
                this.lastLogCount = 0;
                
                // Show monitoring section
                if (this.elements.monitorSection) {
                    this.elements.monitorSection.classList.remove('hidden');
                }
                if (this.elements.startChangingBtn) {
                    this.elements.startChangingBtn.disabled = true;
                }
                if (this.elements.stopChangingBtn) {
                    this.elements.stopChangingBtn.disabled = false;
                }
                
                // Start polling for updates
                this.startPolling();
                
                this.showToast('success', `WordPress change started! Process ID: ${result.processId}`);
                this.addLog('info', `WordPress change started - Process ID: ${result.processId}`);
                this.addLog('info', `Total domains to process: ${result.totalDomains}`);
                
            } else {
                this.showToast('error', `Failed to start change: ${result.error}`);
                this.addLog('error', `WordPress change failed: ${result.error}`);
            }

        } catch (error) {
            console.error('WordPress change error:', error);
            this.showToast('error', 'Failed to start WordPress change');
            this.addLog('error', `WordPress change error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Stop WordPress admin change process
     */
    async stopWordPressChange() {
        if (!this.currentProcessId) return;

        this.showLoading('Stopping process...');
        
        try {
            const response = await fetch(`/api/process/${this.currentProcessId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.stopPolling();
                this.isProcessing = false;
                if (this.elements.startChangingBtn) {
                    this.elements.startChangingBtn.disabled = false;
                }
                if (this.elements.stopChangingBtn) {
                    this.elements.stopChangingBtn.disabled = true;
                }
                
                this.showToast('info', 'Process stopped');
                this.addLog('warn', 'Process stopped by user');
            } else {
                this.showToast('error', `Failed to stop process: ${result.error}`);
            }

        } catch (error) {
            console.error('Stop process error:', error);
            this.showToast('error', 'Failed to stop process');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Start polling for process updates
     */
    startPolling() {
        if (!this.currentProcessId || this.pollingInterval) {
            return;
        }

        this.addLog('info', `Starting polling every ${this.pollingFrequency}ms for process updates`);

        this.pollingInterval = setInterval(async () => {
            try {
                await this.pollProcessStatus();
                await this.pollProcessLogs();
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, this.pollingFrequency);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            this.addLog('info', 'Stopped polling for process updates');
        }
    }

    /**
     * Poll process status
     */
    async pollProcessStatus() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}/status`);
            const result = await response.json();

            if (result.success && result.data) {
                this.handleProcessStatus(result.data);
            } else if (response.status === 404) {
                // Process not found, stop polling
                this.stopPolling();
                this.addLog('warn', 'Process not found, stopped polling');
            }
        } catch (error) {
            console.error('Failed to poll process status:', error);
        }
    }

    /**
     * Poll process logs
     */
    async pollProcessLogs() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}/logs?offset=${this.lastLogCount}`);
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                result.data.forEach(log => {
                    this.addLog(log.level, log.message, new Date(log.timestamp));
                });
                this.lastLogCount += result.data.length;
            }
        } catch (error) {
            console.error('Failed to poll process logs:', error);
        }
    }

    /**
     * Handle process status update
     */
    handleProcessStatus(data) {
        this.updateProgress(data);

        if (data.status === 'completed') {
            this.handleProcessCompleted(data);
        } else if (data.status === 'failed') {
            this.handleProcessFailed(data);
        }
    }

    /**
     * Handle process completion
     */
    handleProcessCompleted(data) {
        this.stopPolling();
        this.isProcessing = false;

        if (this.elements.startChangingBtn) {
            this.elements.startChangingBtn.disabled = false;
        }
        if (this.elements.stopChangingBtn) {
            this.elements.stopChangingBtn.disabled = true;
        }

        this.addLog('success', 'WordPress admin change process completed!');

        // Update successful changes
        if (data.results) {
            this.successfulChanges = data.results.filter(result => result.success);
            this.displayResults(data.results);
        }

        this.showToast('success', 'WordPress change completed!');
        this.updateStartButtonState();
    }

    /**
     * Handle process failure
     */
    handleProcessFailed(data) {
        this.stopPolling();
        this.isProcessing = false;

        if (this.elements.startChangingBtn) {
            this.elements.startChangingBtn.disabled = false;
        }
        if (this.elements.stopChangingBtn) {
            this.elements.stopChangingBtn.disabled = true;
        }

        this.addLog('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
        this.showToast('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
        this.updateStartButtonState();
    }

    /**
     * Update progress display
     */
    updateProgress(data) {
        const stats = data.stats || {};
        const total = stats.total || 0;
        const processed = stats.processed || 0;
        const successful = stats.successful || 0;
        const failed = stats.failed || 0;
        const skipped = stats.skipped || 0;

        const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

        // Update progress bar
        if (this.elements.progressText) {
            this.elements.progressText.textContent = data.currentDomain ? 
                `Processing: ${data.currentDomain}` : 'Processing...';
        }
        if (this.elements.progressPercentage) {
            this.elements.progressPercentage.textContent = `${percentage}%`;
        }
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }

        // Update stats
        if (this.elements.processedCount) this.elements.processedCount.textContent = processed;
        if (this.elements.successCount) this.elements.successCount.textContent = successful;
        if (this.elements.failedCount) this.elements.failedCount.textContent = failed;
        if (this.elements.skippedCount) this.elements.skippedCount.textContent = skipped;
    }

    /**
     * Display results
     */
    displayResults(results) {
        if (!results || results.length === 0) return;

        const successfulResults = results.filter(r => r.success);
        
        if (this.elements.successfulChangesCount) {
            this.elements.successfulChangesCount.textContent = successfulResults.length;
        }

        if (this.elements.resultsList) {
            this.elements.resultsList.innerHTML = results.map(result => `
                <div class="account-card ${result.success ? 'success' : 'failed'}">
                    <div class="account-header">
                        <div class="account-domain">${result.domain}</div>
                        <div class="account-status ${result.success ? 'status-success' : 'status-error'}">
                            ${result.success ? '✓ Success' : '✗ Failed'}
                        </div>
                    </div>
                    <div class="account-details">
                        ${result.success ? `
                            <div class="detail-row">
                                <span class="detail-label">cPanel User:</span>
                                <span class="detail-value">${result.cpanelUser || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">WP Admin User:</span>
                                <span class="detail-value">${result.wpUser || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">WP Admin Email:</span>
                                <span class="detail-value">${result.wpEmail || `admin@${result.domain}`}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">New Password:</span>
                                <span class="detail-value password-field">${result.newPassword || 'N/A'}</span>
                            </div>
                            ${result.loginUrl ? `
                            <div class="detail-row">
                                <span class="detail-label">Login URL:</span>
                                <div class="login-link-container">
                                    <a href="${result.loginUrl}" target="_blank" class="login-link ${result.hasMagicLink ? 'magic-link' : ''}">
                                        ${result.hasMagicLink ? '🔗 Magic Login' : '🔗 Login Page'}
                                    </a>
                                    <button onclick="navigator.clipboard.writeText('${result.loginUrl}')" class="copy-btn" title="Copy link">
                                        📋
                                    </button>
                                </div>
                            </div>
                            ` : ''}
                        ` : `
                            <div class="detail-row error">
                                <span class="detail-label">Error:</span>
                                <span class="detail-value">${result.error || 'Unknown error'}</span>
                            </div>
                        `}
                    </div>
                </div>
            `).join('');
        }

        // Show results section
        if (this.elements.resultsSection) {
            this.elements.resultsSection.classList.remove('hidden');
        }
    }

    /**
     * Add log entry
     */
    addLog(level, message, timestamp = new Date()) {
        if (!this.elements.logsContent) return;

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;

        const timeStr = timestamp.toLocaleTimeString();
        
        logEntry.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-level">[${level.toUpperCase()}]</span>
            <span class="log-message">${message}</span>
        `;

        this.elements.logsContent.appendChild(logEntry);

        // Auto-scroll if enabled
        if (this.elements.autoScrollLogs && this.elements.autoScrollLogs.checked) {
            this.scrollLogsToBottom();
        }
    }

    /**
     * Scroll logs to bottom
     */
    scrollLogsToBottom() {
        if (this.elements.logsContent) {
            this.elements.logsContent.scrollTop = this.elements.logsContent.scrollHeight;
        }
    }

    /**
     * Clear logs
     */
    clearLogs() {
        if (this.elements.logsContent) {
            this.elements.logsContent.innerHTML = '';
        }
        this.showToast('info', 'Logs cleared');
    }

    /**
     * Clear previous process data
     */
    clearPreviousData() {
        // Clear timeout if active
        if (this.clearDataTimeout) {
            clearTimeout(this.clearDataTimeout);
            this.clearDataTimeout = null;
        }

        // Stop polling
        this.stopPolling();

        // Reset process state
        this.currentProcessId = null;
        this.isProcessing = false;
        this.lastLogCount = 0;
        this.successfulChanges = [];

        // Hide UI sections
        if (this.elements.monitorSection) {
            this.elements.monitorSection.classList.add('hidden');
        }
        if (this.elements.resultsSection) {
            this.elements.resultsSection.classList.add('hidden');
        }

        // Reset progress
        if (this.elements.progressText) this.elements.progressText.textContent = 'Initializing...';
        if (this.elements.progressPercentage) this.elements.progressPercentage.textContent = '0%';
        if (this.elements.progressFill) this.elements.progressFill.style.width = '0%';

        // Reset stats
        if (this.elements.processedCount) this.elements.processedCount.textContent = '0';
        if (this.elements.successCount) this.elements.successCount.textContent = '0';
        if (this.elements.failedCount) this.elements.failedCount.textContent = '0';
        if (this.elements.skippedCount) this.elements.skippedCount.textContent = '0';

        // Clear logs
        if (this.elements.logsContent) {
            this.elements.logsContent.innerHTML = '';
        }

        // Update button states
        this.updateStartButtonState();

        // Show toast notification
        this.showToast('info', 'Previous data cleared. Starting fresh...');
    }

    /**
     * Export results
     */
    exportResults() {
        if (!this.successfulChanges || this.successfulChanges.length === 0) {
            this.showToast('error', 'No successful changes to export');
            return;
        }

        try {
            let content = 'WordPress Admin Change Results\n';
            content += '================================\n\n';
            content += `Export Date: ${new Date().toLocaleString()}\n`;
            content += `Total Successful Changes: ${this.successfulChanges.length}\n\n`;

            this.successfulChanges.forEach((result, index) => {
                content += `${index + 1}. Domain: ${result.domain}\n`;
                content += `   cPanel User: ${result.cpanelUser || 'N/A'}\n`;
                content += `   WP Admin User: ${result.wpUser || 'N/A'}\n`;
                content += `   WP Admin Email: ${result.wpEmail || `admin@${result.domain}`}\n`;
                content += `   New Password: ${result.newPassword || 'N/A'}\n`;
                if (result.loginUrl) {
                    content += `   Login URL: ${result.loginUrl}\n`;
                }
                content += '\n';
            });

            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `wordpress-changes-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            this.showToast('success', 'Results exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('error', 'Failed to export results');
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(text = 'Loading...') {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.remove('hidden');
        }
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = text;
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show toast notification
     */
    showToast(type, message, duration = 5000) {
        if (!this.elements.toastContainer) return;

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

        // Auto-remove after duration
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.wordpressChanger = new WordPressAdminChanger();
});