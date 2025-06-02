/**
 * WordPress Admin Changer - Frontend Application (REST API Version)
 * Uses REST API polling instead of websockets, matching index.html functionality
 */

class WordPressAdminChanger {
    constructor() {
        this.currentProcessId = null;
        this.isProcessing = false;
        this.isSshConnected = false;
        this.validationResults = null;
        this.processResults = null;
        this.successfulChanges = [];
        this.skippedDomains = [];
        this.failedChanges = [];
        this.dnsErrors = [];
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
            exportSuccessBtn: document.getElementById('exportSuccessBtn'),
            exportFailedBtn: document.getElementById('exportFailedBtn'),
            
            // Status displays
            progressText: document.getElementById('progressText'),
            progressPercentage: document.getElementById('progressPercentage'),
            progressFill: document.getElementById('progressFill'),
            processedCount: document.getElementById('processedCount'),
            successCount: document.getElementById('successCount'),
            failedCount: document.getElementById('failedCount'),
            skippedCount: document.getElementById('skippedCount'),
            
            // Sections
            monitorSection: document.getElementById('monitorSection'),
            successfulChangesSection: document.getElementById('successfulChangesSection'),
            successfulChangesList: document.getElementById('successfulChangesList'),
            successfulChangesCount: document.getElementById('successfulChangesCount'),
            skippedDomainsSection: document.getElementById('skippedDomainsSection'),
            skippedDomainsList: document.getElementById('skippedDomainsList'),
            skippedDomainsCount: document.getElementById('skippedDomainsCount'),
            failedChangesSection: document.getElementById('failedChangesSection'),
            failedChangesList: document.getElementById('failedChangesList'),
            failedChangesCount: document.getElementById('failedChangesCount'),
            dnsErrorsSection: document.getElementById('dnsErrorsSection'),
            dnsErrorsList: document.getElementById('dnsErrorsList'),
            dnsErrorsCount: document.getElementById('dnsErrorsCount'),
            
            // Logs
            logsContent: document.getElementById('logsContent'),
            autoScrollLogs: document.getElementById('autoScrollLogs'),
            
            // Validation
            domainValidation: document.getElementById('domainValidation'),
            totalDomains: document.getElementById('totalDomains'),
            validDomains: document.getElementById('validDomains'),
            invalidDomains: document.getElementById('invalidDomains'),
            duplicateDomains: document.getElementById('duplicateDomains'),
            invalidList: document.getElementById('invalidList'),
            duplicateList: document.getElementById('duplicateList'),
            invalidDomainsUl: document.getElementById('invalidDomainsUl'),
            duplicateDomainsUl: document.getElementById('duplicateDomainsUl'),
            
            // Loading
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            
            // Toast container
            toastContainer: document.getElementById('toastContainer')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // SSH credential field changes (save all changes including passwords)
        ['sshHost', 'sshPort', 'sshUsername', 'sshPassword'].forEach(field => {
            this.elements[field].addEventListener('input', () => {
                this.validateSshFields();
                this.saveSshConnectionData(); // Save SSH data including passwords
            });
        });

        // WordPress config field changes
        this.elements.newWpPassword.addEventListener('input', () => {
            this.validateWordPressFields();
            this.saveFormData();
        });

        // Show/hide password toggle
        this.elements.showPassword.addEventListener('change', (e) => {
            this.elements.newWpPassword.type = e.target.checked ? 'text' : 'password';
            this.saveFormData();
        });

        this.elements.domainList.addEventListener('input', () => {
            // Clear previous data when user starts typing new domains
            if (this.currentProcessId || this.successfulChanges.length > 0) {
                // Add a small delay to avoid clearing on every keystroke
                clearTimeout(this.clearDataTimeout);
                this.clearDataTimeout = setTimeout(() => {
                    this.clearPreviousData();
                }, 1000); // Wait 1 second after user stops typing
            }
            this.validateDomainFields();
            this.saveFormData(); // Save domain list
        });

        // Button clicks
        this.elements.testSshConnectionBtn.addEventListener('click', () => {
            this.testSshConnection();
        });

        this.elements.validateDomainsBtn.addEventListener('click', () => {
            this.validateDomains();
        });

        this.elements.clearDomainsBtn.addEventListener('click', () => {
            this.clearDomains();
        });

        this.elements.startChangingBtn.addEventListener('click', () => {
            this.startWordPressChange();
        });

        this.elements.stopChangingBtn.addEventListener('click', () => {
            this.stopWordPressChange();
        });

        this.elements.clearLogsBtn.addEventListener('click', () => {
            this.clearLogs();
        });

        this.elements.exportSuccessBtn.addEventListener('click', () => {
            this.exportChangesToTxt();
        });

        // Clear successful changes event listener
        document.getElementById('clearSuccessfulChangesBtn').addEventListener('click', () => {
            this.clearSuccessfulChangesList();
        });

        // Failed changes event listeners
        document.getElementById('exportFailedBtn').addEventListener('click', () => this.exportFailedToTxt());
        document.getElementById('clearFailedList').addEventListener('click', () => this.clearFailedChangesList());

        // Auto-scroll logs
        this.elements.autoScrollLogs.addEventListener('change', () => {
            if (this.elements.autoScrollLogs.checked) {
                this.scrollLogsToBottom();
            }
        });
    }

    /**
     * Load form defaults from localStorage
     */
    loadFormDefaults() {
        const savedValues = JSON.parse(localStorage.getItem('wordpressChanger_formData') || '{}');
        
        Object.keys(savedValues).forEach(key => {
            if (this.elements[key]) {
                if (this.elements[key].type === 'checkbox') {
                    this.elements[key].checked = savedValues[key];
                } else {
                    this.elements[key].value = savedValues[key];
                }
            }
        });

        // Load saved SSH connection data if exists
        try {
            const savedSshDataEncoded = localStorage.getItem('wordpressChanger_sshConnection');
            if (savedSshDataEncoded) {
                // Try to decode the data (handle both old and new formats)
                let savedSshData;
                try {
                    savedSshData = JSON.parse(atob(savedSshDataEncoded));
                } catch (e) {
                    // Fallback to plain JSON if base64 fails
                    savedSshData = JSON.parse(savedSshDataEncoded);
                }
                
                if (savedSshData) {
                    console.log('SSH connection data loaded from localStorage:', {
                        host: savedSshData.host,
                        port: savedSshData.port,
                        username: savedSshData.username,
                        hasPassword: !!savedSshData.password
                    });
                    
                    this.elements.sshHost.value = savedSshData.host || '';
                    this.elements.sshPort.value = savedSshData.port || 22;
                    this.elements.sshUsername.value = savedSshData.username || '';
                    this.elements.sshPassword.value = savedSshData.password || '';
                }
            }
        } catch (error) {
            console.error('Error loading saved SSH connection data:', error);
        }

        // Apply show/hide password state after loading
        if (this.elements.showPassword && this.elements.showPassword.checked) {
            this.elements.newWpPassword.type = 'text';
        }

        // Trigger validations
        this.validateSshFields();
        this.validateWordPressFields();
        this.validateDomainFields();
    }

    /**
     * Save form data to localStorage
     */
    saveFormData() {
        try {
            const fieldsToSave = [
                'newWpPassword', 'showPassword', 'domainList'
            ];
            
            const formData = {};
            fieldsToSave.forEach(field => {
                if (this.elements[field]) {
                    if (this.elements[field].type === 'checkbox') {
                        formData[field] = this.elements[field].checked;
                    } else {
                        formData[field] = this.elements[field].value;
                    }
                }
            });
            
            localStorage.setItem('wordpressChanger_formData', JSON.stringify(formData));
        } catch (error) {
            console.error('Error saving form data:', error);
        }
    }

    /**
     * Save SSH connection data to localStorage (encoded for security)
     */
    saveSshConnectionData() {
        const sshData = {
            host: this.elements.sshHost.value,
            port: this.elements.sshPort.value,
            username: this.elements.sshUsername.value,
            password: this.elements.sshPassword.value
        };
        
        // Encode the data before storing
        const encoded = btoa(JSON.stringify(sshData));
        localStorage.setItem('wordpressChanger_sshConnection', encoded);
        
        console.log('SSH connection data saved to localStorage:', {
            host: sshData.host,
            port: sshData.port,
            username: sshData.username,
            hasPassword: !!sshData.password
        });
    }

    /**
     * Get SSH credentials
     */
    getSshCredentials() {
        return {
            host: this.elements.sshHost.value.trim(),
            port: parseInt(this.elements.sshPort.value) || 22,
            username: this.elements.sshUsername.value.trim(),
            password: this.elements.sshPassword.value
        };
    }

    /**
     * Validate SSH credential fields and enable/disable test button
     */
    validateSshFields() {
        const host = this.elements.sshHost.value.trim();
        const username = this.elements.sshUsername.value.trim();
        const password = this.elements.sshPassword.value;

        const isValid = host && username && password;

        this.elements.testSshConnectionBtn.disabled = !isValid;
        
        // Save SSH connection data whenever valid data is entered
        if (isValid) {
            this.saveSshConnectionData();
        }
        
        this.updateStartButtonState();
    }

    /**
     * Validate WordPress credential fields
     */
    validateWordPressFields() {
        const newPassword = this.elements.newWpPassword.value;
        this.updateStartButtonState();
        return !!newPassword;
    }

    /**
     * Validate domain fields and enable/disable related buttons
     */
    validateDomainFields() {
        const domains = this.elements.domainList.value.trim();
        this.elements.validateDomainsBtn.disabled = !domains;
        this.updateStartButtonState();
    }

    /**
     * Update start button state based on all requirements (matching index.js pattern)
     */
    updateStartButtonState() {
        const hasDomains = this.elements.domainList.value.trim();
        const hasValidDomains = this.validationResults && this.validationResults.valid.length > 0;
        const hasSshCredentials = this.getSshCredentials().host && this.getSshCredentials().username && this.getSshCredentials().password;
        const hasWpPassword = this.elements.newWpPassword.value;
        
        // More strict validation like index.js - require connection test or valid credentials
        const canStart = hasSshCredentials && hasWpPassword && hasValidDomains && !this.isProcessing;
        
        this.elements.startChangingBtn.disabled = !canStart;
        this.elements.stopChangingBtn.disabled = !this.isProcessing;
    }

    /**
     * Update connection status display (placeholder for REST mode)
     */
    updateConnectionStatus(status) {
        // No UI elements for connection status in REST mode
        console.log('Connection status:', status);
    }

    /**
     * Get domain list from textarea
     */
    getDomainList() {
        const domainText = this.elements.domainList.value || '';
        return domainText.split('\n')
            .map(domain => domain.trim())
            .filter(domain => domain.length > 0);
    }

    /**
     * Get SSH credentials
     */
    getSshCredentials() {
        return {
            host: this.elements.sshHost.value.trim(),
            port: parseInt(this.elements.sshPort.value) || 22,
            username: this.elements.sshUsername.value.trim(),
            password: this.elements.sshPassword.value
        };
    }

    /**
     * Test SSH connection (matching index.js pattern)
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
                this.isSshConnected = true;
                this.showToast('success', 'SSH connection successful!');
                this.addLog('info', 'SSH connection test passed');
                
                // Save SSH connection data after successful test (matching index.js pattern)
                this.saveSshConnectionData();
                
                // Update button states
                this.updateStartButtonState();
            } else {
                this.isSshConnected = false;
                this.showToast('error', `SSH connection failed: ${result.error}`);
                this.addLog('error', `SSH connection failed: ${result.error}`);
                this.updateStartButtonState();
            }

        } catch (error) {
            console.error('SSH test error:', error);
            this.isSshConnected = false;
            this.showToast('error', 'Failed to test SSH connection');
            this.addLog('error', `SSH connection test error: ${error.message}`);
            this.updateStartButtonState();
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
        
        // Don't clear previous process data when clearing domains
        this.showToast('info', 'Domains cleared');
        
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

        // Clear previous data when starting new process (matching index.js pattern)
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
                console.log('Process started successfully:', result);
                this.currentProcessId = result.processId;
                this.isProcessing = true;
                this.lastLogCount = 0;
                
                console.log('Process ID set to:', this.currentProcessId);
                
                // Show monitoring section
                if (this.elements.monitorSection) {
                    console.log('Showing monitor section');
                    this.elements.monitorSection.classList.remove('hidden');
                } else {
                    console.log('Monitor section element not found!');
                }
                
                // Update button states
                this.updateStartButtonState();
                
                // Start polling for updates
                console.log('About to start polling...');
                this.startPolling();
                
                this.showToast('success', `WordPress change started! Process ID: ${result.processId}`);
                this.addLog('info', `WordPress change started - Process ID: ${result.processId}`);
                this.addLog('info', `Total domains to process: ${result.totalDomains || this.validationResults.valid.length}`);
                
                if (result.invalidDomains > 0) {
                    this.addLog('warn', `${result.invalidDomains} invalid domains will be skipped`);
                }
                if (result.duplicateDomains > 0) {
                    this.addLog('warn', `${result.duplicateDomains} duplicate domains will be skipped`);
                }
                
            } else {
                this.isProcessing = false;
                this.updateStartButtonState();
                this.showToast('error', `Failed to start change: ${result.error}`);
                this.addLog('error', `WordPress change failed: ${result.error}`);
            }

        } catch (error) {
            console.error('WordPress change error:', error);
            this.isProcessing = false;
            this.updateStartButtonState();
            this.showToast('error', 'Failed to start WordPress change');
            this.addLog('error', `WordPress change error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Stop WordPress admin change process (matching index.js pattern)
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
                this.updateStartButtonState();
                
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
     * Start polling for process updates (matching index.js pattern)
     */
    startPolling() {
        if (!this.currentProcessId || this.pollingInterval) {
            console.log('Polling not started:', { currentProcessId: this.currentProcessId, pollingInterval: this.pollingInterval });
            return;
        }

        console.log('Starting polling for process:', this.currentProcessId);
        this.addLog('info', `Starting polling every ${this.pollingFrequency}ms for process updates`);

        this.pollingInterval = setInterval(async () => {
            try {
                console.log('Polling tick - fetching status and logs...');
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
     * Poll process status (matching index.js pattern)
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
     * Poll process logs (matching index.js pattern)
     */
    async pollProcessLogs() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}/logs?limit=50`);
            const result = await response.json();

            if (result.success && result.data.logs) {
                this.handleNewLogs(result.data.logs);
            }
        } catch (error) {
            console.error('Failed to poll process logs:', error);
        }
    }

    /**
     * Handle new logs from polling (matching index.js pattern)
     */
    handleNewLogs(logs) {
        // Only add new logs we haven't seen before
        const newLogs = logs.slice(this.lastLogCount);
        this.lastLogCount = logs.length;

        newLogs.forEach(log => {
            this.handleLog(log);
        });
    }

    /**
     * Handle individual log entry (matching index.js pattern)
     */
    handleLog(data) {
        // Extract log data
        const logData = data.data || data;
        const level = logData.level || data.level || 'info';
        const message = logData.message || data.message || 'No message';
        const timestamp = logData.timestamp || data.timestamp || new Date().toISOString();
        
        this.addLog(level, message, new Date(timestamp));

        // Handle special log types that update results (matching index.js pattern)
        if (logData.type === 'wordpress_success' || (logData.success && logData.domain)) {
            this.addSuccessfulChangeFromLog(logData);
        } else if (logData.type === 'wordpress_failed' || (logData.success === false && logData.domain)) {
            this.addFailedChangeFromLog(logData);
        }
    }

    /**
     * Add successful change from log data (matching index.js pattern)
     */
    addSuccessfulChangeFromLog(logData) {
        if (!logData.domain) return;

        const changeData = {
            domain: logData.domain,
            cpanelUser: logData.cpanelUser || logData.username,
            wpUser: logData.wpUser || logData.wpUsername,
            wpEmail: logData.wpEmail || logData.email,
            newPassword: logData.newPassword || logData.newWpPassword,
            loginUrl: logData.loginUrl,
            hasMagicLink: logData.hasMagicLink || false,
            success: true
        };

        this.addSuccessfulChange(changeData);
    }

    /**
     * Add failed change from log data (matching index.js pattern)
     */
    addFailedChangeFromLog(logData) {
        if (!logData.domain) return;

        const failedData = {
            domain: logData.domain,
            error: logData.error || logData.message || 'Unknown error',
            cpanelUser: logData.cpanelUser || logData.username,
            success: false
        };

        this.addFailedChange(failedData);
    }

    /**
     * Add successful change (matching index.js pattern)
     */
    addSuccessfulChange(changeData) {
        // Avoid duplicates
        if (!this.successfulChanges.some(change => change.domain === changeData.domain)) {
            this.successfulChanges.push(changeData);
            
            // Update display
            if (this.elements.successfulChangesCount) {
                this.elements.successfulChangesCount.textContent = this.successfulChanges.length;
            }
            
            // Show section if hidden
            if (this.elements.successfulChangesSection) {
                this.elements.successfulChangesSection.classList.remove('hidden');
            }
            
            // Update the list display
            this.displaySuccessfulChanges(this.successfulChanges);
        }
    }

    /**
     * Add failed change (matching index.js pattern)
     */
    addFailedChange(failedData) {
        // Avoid duplicates
        if (!this.failedChanges.some(change => change.domain === failedData.domain)) {
            this.failedChanges.push(failedData);
            
            // Update display
            if (this.elements.failedChangesCount) {
                this.elements.failedChangesCount.textContent = this.failedChanges.length;
            }
            
            // Show section if hidden
            if (this.elements.failedChangesSection) {
                this.elements.failedChangesSection.classList.remove('hidden');
            }
            
            // Update the list display
            this.displayFailedChanges(this.failedChanges);
        }
    }

    /**
     * Handle process status update
     */
    handleProcessStatus(data) {
        console.log('handleProcessStatus received:', data);
        this.updateProgress(data);

        if (data.status === 'completed') {
            this.handleProcessCompleted(data);
        } else if (data.status === 'failed') {
            this.handleProcessFailed(data);
        }
    }

    /**
     * Handle process completion (matching index.js pattern)
     */
    handleProcessCompleted(data) {
        this.stopPolling();
        this.isProcessing = false;
        this.updateStartButtonState();

        this.addLog('success', 'WordPress admin change process completed!');

        // Handle results like in index.js - store all results
        if (data.results) {
            // Handle both data.results (array) and data.results.results (nested object) formats
            const results = Array.isArray(data.results) ? data.results : (data.results.results || []);
            if (results.length > 0) {
                this.processResults = results; // Store all results for export
                
                // Separate successful and failed results
                this.successfulChanges = results.filter(result => result.success);
                this.failedChanges = results.filter(result => !result.success);
                
                this.displayResults(results);
            } else {
                this.addLog('warn', 'Process completed but no results found to display');
                this.showEmptyResults();
            }
        } else {
            this.addLog('warn', 'No results data received from server');
            this.showEmptyResults();
        }

        this.showToast('success', 'WordPress change completed!');
    }

    /**
     * Show empty results state (matching index.js pattern)
     */
    showEmptyResults() {
        // Don't show sections if no results
        if (this.elements.successfulChangesSection) {
            this.elements.successfulChangesSection.classList.add('hidden');
        }
        if (this.elements.failedChangesSection) {
            this.elements.failedChangesSection.classList.add('hidden');
        }
    }

    /**
     * Handle process failure (matching index.js pattern)
     */
    handleProcessFailed(data) {
        this.stopPolling();
        this.isProcessing = false;
        this.updateStartButtonState();

        this.addLog('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
        this.showToast('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
    }

    /**
     * Update progress display (matching index.js handleProgress pattern)
     */
    updateProgress(data) {
        // Progress data is nested in data.progress from processStateManager
        const progress = data.progress || data;
        
        console.log('updateProgress called with data:', data);
        console.log('Extracted progress:', progress);
        
        // Handle both old structure (data.stats) and new structure (direct properties)
        const total = progress.total || (progress.stats && progress.stats.total) || 0;
        const processed = progress.current || (progress.stats && progress.stats.processed) || 0;
        const successful = progress.successful || (progress.stats && progress.stats.successful) || 0;
        const failed = progress.failed || (progress.stats && progress.stats.failed) || 0;
        const skipped = progress.skipped || (progress.stats && progress.stats.skipped) || 0;

        const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

        console.log('Progress values:', { total, processed, successful, failed, skipped, percentage });

        // Update progress bar
        if (this.elements.progressText) {
            const currentItem = progress.currentItem || progress.currentDomain;
            this.elements.progressText.textContent = currentItem ?
                `Processing: ${currentItem}` : (processed > 0 ? `Processing... (${processed}/${total})` : 'Processing...');
        }
        if (this.elements.progressPercentage) {
            this.elements.progressPercentage.textContent = `${percentage}%`;
        }
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }

        // Update stats normally - let the backend data drive the display
        if (this.elements.processedCount) this.elements.processedCount.textContent = processed;
        if (this.elements.successCount) this.elements.successCount.textContent = successful;
        if (this.elements.failedCount) this.elements.failedCount.textContent = failed;
        if (this.elements.skippedCount) this.elements.skippedCount.textContent = skipped;
    }

    /**
     * Handle progress updates (matching index.js pattern)
     */
    handleProgress(progress) {
        this.updateProgress({ progress });
    }

    /**
     * Display results (matching index.js pattern - show individual sections)
     */
    displayResults(results) {
        if (!results || results.length === 0) {
            return;
        }

        const successfulResults = results.filter(r => r.success);
        const failedResults = results.filter(r => !r.success);
        
        // Display successful results section
        this.displaySuccessfulChanges(successfulResults);
        
        // Display failed results section
        this.displayFailedChanges(failedResults);
    }

    /**
     * Display successful changes (matching index.js pattern)
     */
    displaySuccessfulChanges(successfulResults) {
        // Update count
        if (this.elements.successfulChangesCount) {
            this.elements.successfulChangesCount.textContent = successfulResults.length;
        }

        // Show/hide section based on results
        if (this.elements.successfulChangesSection) {
            if (successfulResults.length > 0) {
                this.elements.successfulChangesSection.classList.remove('hidden');
                
                // Populate results list
                if (this.elements.successfulChangesList) {
                    this.elements.successfulChangesList.innerHTML = successfulResults.map(result => `
                        <div class="account-card success">
                            <div class="account-header">
                                <div class="account-domain">${result.domain}</div>
                                <div class="account-status status-success">
                                    ✓ Success
                                </div>
                            </div>
                            <div class="account-details">
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
                                    <span class="detail-value password-field">${result.newPassword || result.newWpPassword || 'N/A'}</span>
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
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                this.elements.successfulChangesSection.classList.add('hidden');
            }
        }
    }

    /**
     * Display failed changes (matching index.js pattern)
     */
    displayFailedChanges(failedResults) {
        // Update count
        if (this.elements.failedChangesCount) {
            this.elements.failedChangesCount.textContent = failedResults.length;
        }

        // Show/hide section based on results
        if (this.elements.failedChangesSection) {
            if (failedResults.length > 0) {
                this.elements.failedChangesSection.classList.remove('hidden');
                
                // Populate results list
                if (this.elements.failedChangesList) {
                    this.elements.failedChangesList.innerHTML = failedResults.map(result => `
                        <div class="account-card failed">
                            <div class="account-header">
                                <div class="account-domain">${result.domain}</div>
                                <div class="account-status status-error">
                                    ✗ Failed
                                </div>
                            </div>
                            <div class="account-details">
                                <div class="detail-row error">
                                    <span class="detail-label">Error:</span>
                                    <span class="detail-value">${result.error || 'Unknown error'}</span>
                                </div>
                                ${result.cpanelUser ? `
                                <div class="detail-row">
                                    <span class="detail-label">cPanel User:</span>
                                    <span class="detail-value">${result.cpanelUser}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                this.elements.failedChangesSection.classList.add('hidden');
            }
        }
    }

    /**
     * Debug function to check if all elements are properly initialized
     */
    debugElementCheck() {
        console.log('=== Element Check ===');
        Object.keys(this.elements).forEach(key => {
            const element = this.elements[key];
            console.log(`${key}:`, element ? 'Found' : 'NOT FOUND');
        });
        console.log('=== End Element Check ===');
    }

    /**
     * Test function to manually update progress (for debugging)
     */
    testProgress() {
        console.log('Testing progress update...');
        
        // Show monitor section first
        if (this.elements.monitorSection) {
            this.elements.monitorSection.classList.remove('hidden');
        }
        
        // Test progress data
        const testProgressData = {
            progress: {
                current: 3,
                total: 10,
                successful: 2,
                failed: 1,
                skipped: 0,
                currentItem: 'test-domain.com',
                status: 'processing'
            }
        };
        
        this.updateProgress(testProgressData);
    }

    /**
     * Test function to manually display sample results (for debugging)
     */
    testDisplayResults() {
        const sampleResults = [
            {
                domain: 'test1.com',
                success: true,
                cpanelUser: 'testuser1',
                wpUser: 'admin',
                wpEmail: 'admin@test1.com',
                newPassword: 'newpass123',
                loginUrl: 'https://test1.com/wp-admin/',
                hasMagicLink: false
            },
            {
                domain: 'test2.com',
                success: true,
                cpanelUser: 'testuser2',
                wpUser: 'administrator',
                wpEmail: 'admin@test2.com',
                newPassword: 'newpass456',
                loginUrl: 'https://test2.com/wp-admin/?login_key=abc123',
                hasMagicLink: true
            },
            {
                domain: 'test3.com',
                success: false,
                error: 'WordPress not found'
            }
        ];

        console.log('Testing displayResults with sample data...');
        this.displayResults(sampleResults);
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
     * Clear previous process data (matching index.js pattern)
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
        this.failedChanges = [];
        this.processResults = [];

        // Hide results sections (matching index.js pattern)
        if (this.elements.successfulChangesSection) {
            this.elements.successfulChangesSection.classList.add('hidden');
        }
        if (this.elements.failedChangesSection) {
            this.elements.failedChangesSection.classList.add('hidden');
        }

        // Reset progress
        if (this.elements.progressText) this.elements.progressText.textContent = 'Initializing...';
        if (this.elements.progressPercentage) this.elements.progressPercentage.textContent = '0%';
        if (this.elements.progressFill) this.elements.progressFill.style.width = '0%';

        // Reset progress counters
        if (this.elements.processedCount) this.elements.processedCount.textContent = '0';
        if (this.elements.successCount) this.elements.successCount.textContent = '0';
        if (this.elements.failedCount) this.elements.failedCount.textContent = '0';
        if (this.elements.skippedCount) this.elements.skippedCount.textContent = '0';

        // Clear results lists and counts (matching index.js pattern)
        if (this.elements.successfulChangesList) {
            this.elements.successfulChangesList.innerHTML = '';
        }
        if (this.elements.failedChangesList) {
            this.elements.failedChangesList.innerHTML = '';
        }
        if (this.elements.successfulChangesCount) {
            this.elements.successfulChangesCount.textContent = '0';
        }
        if (this.elements.failedChangesCount) {
            this.elements.failedChangesCount.textContent = '0';
        }

        // Update button states
        this.updateStartButtonState();

        // Show toast notification
        this.showToast('info', 'Previous data cleared. Starting fresh...');
    }

    /**
     * Export successful changes to TXT (matching index.js pattern)
     */
    exportChangesToTxt() {
        if (this.successfulChanges.length === 0) {
            this.showToast('error', 'No successful changes to export');
            return;
        }

        try {
            let content = 'WordPress Admin Changes - Successful Results\n';
            content += '=' .repeat(50) + '\n\n';
            content += `Export Date: ${new Date().toLocaleString()}\n`;
            content += `Total Changes: ${this.successfulChanges.length}\n\n`;

            this.successfulChanges.forEach((result, index) => {
                content += `${index + 1}. Domain: ${result.domain}\n`;
                content += `   cPanel User: ${result.cpanelUser || 'N/A'}\n`;
                content += `   WP Admin User: ${result.wpUser || 'N/A'}\n`;
                content += `   WP Admin Email: ${result.wpEmail || `admin@${result.domain}`}\n`;
                content += `   New Password: ${result.newPassword || result.newWpPassword || 'N/A'}\n`;
                if (result.loginUrl) {
                    content += `   Login URL: ${result.loginUrl}\n`;
                    content += `   Magic Link: ${result.hasMagicLink ? 'Yes' : 'No'}\n`;
                }
                content += '\n';
            });

            const filename = `wordpress-success-${new Date().toISOString().split('T')[0]}.txt`;
            this.downloadFile(content, filename, 'text/plain');
            this.showToast('success', 'Successful changes exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('error', 'Failed to export successful changes');
        }
    }

    /**
     * Export failed changes to TXT (matching index.js pattern)
     */
    exportFailedToTxt() {
        if (this.failedChanges.length === 0) {
            this.showToast('error', 'No failed changes to export');
            return;
        }

        try {
            const failedDomains = this.failedChanges.map(result => result.domain).join('\n');
            const filename = `wordpress-failed-domains-${new Date().toISOString().split('T')[0]}.txt`;
            
            this.downloadFile(failedDomains, filename, 'text/plain');
            this.showToast('success', 'Failed domains list exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('error', 'Failed to export failed changes');
        }
    }

    /**
     * Format export content (helper method)
     */
    formatExportContent(resultsToExport, title, type) {
        let content = `${title}\n`;
        content += '='.repeat(title.length) + '\n\n';
        content += `Export Date: ${new Date().toLocaleString()}\n`;
        content += `Total Results: ${resultsToExport.length}\n`;
        
        if (type === 'all') {
            const successCount = this.processResults.filter(r => r.success).length;
            const failedCount = this.processResults.filter(r => !r.success).length;
            content += `Successful: ${successCount}\n`;
            content += `Failed: ${failedCount}\n`;
        }
        
        content += '\n';

        resultsToExport.forEach((result, index) => {
            content += `${index + 1}. Domain: ${result.domain}\n`;
            content += `   Status: ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
            
            if (result.success) {
                content += `   cPanel User: ${result.cpanelUser || 'N/A'}\n`;
                content += `   WP Admin User: ${result.wpUser || 'N/A'}\n`;
                content += `   WP Admin Email: ${result.wpEmail || `admin@${result.domain}`}\n`;
                content += `   New Password: ${result.newPassword || result.newWpPassword || 'N/A'}\n`;
                if (result.loginUrl) {
                    content += `   Login URL: ${result.loginUrl}\n`;
                    content += `   Magic Link: ${result.hasMagicLink ? 'Yes' : 'No'}\n`;
                }
            } else {
                content += `   Error: ${result.error || 'Unknown error'}\n`;
                if (result.cpanelUser) {
                    content += `   cPanel User: ${result.cpanelUser}\n`;
                }
            }
            content += '\n';
        });

        // Add summary at the end
        content += '\n' + '='.repeat(50) + '\n';
        content += 'SUMMARY\n';
        content += '='.repeat(50) + '\n';
        content += `Total Exported: ${resultsToExport.length}\n`;
        
        if (type === 'all') {
            const successCount = resultsToExport.filter(r => r.success).length;
            const failedCount = resultsToExport.filter(r => !r.success).length;
            content += `Successful: ${successCount}\n`;
            content += `Failed: ${failedCount}\n`;
            content += `Success Rate: ${((successCount / resultsToExport.length) * 100).toFixed(1)}%\n`;
        }

        return content;
    }

    /**
     * Download file helper method (matching index.js pattern)
     */
    downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
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

    /**
     * Clear successful changes list (matching index.js pattern)
     */
    clearSuccessfulChangesList() {
        this.successfulChanges = [];
        if (this.elements.successfulChangesSection) {
            this.elements.successfulChangesSection.classList.add('hidden');
        }
        if (this.elements.successfulChangesList) {
            this.elements.successfulChangesList.innerHTML = '';
        }
        if (this.elements.successfulChangesCount) {
            this.elements.successfulChangesCount.textContent = '0';
        }
        this.showToast('info', 'Successful changes list cleared');
    }

    /**
     * Clear failed changes list (matching index.js pattern)
     */
    clearFailedChangesList() {
        this.failedChanges = [];
        if (this.elements.failedChangesSection) {
            this.elements.failedChangesSection.classList.add('hidden');
        }
        if (this.elements.failedChangesList) {
            this.elements.failedChangesList.innerHTML = '';
        }
        if (this.elements.failedChangesCount) {
            this.elements.failedChangesCount.textContent = '0';
        }
        this.showToast('info', 'Failed changes list cleared');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.wordpressChanger = new WordPressAdminChanger();
    
    // Add test functions to window for debugging
    window.testWordPressResults = () => {
        if (window.wordpressChanger) {
            window.wordpressChanger.testDisplayResults();
        }
    };
    
    window.debugWordPressElements = () => {
        if (window.wordpressChanger) {
            window.wordpressChanger.debugElementCheck();
        }
    };
    
    window.testWordPressProgress = () => {
        if (window.wordpressChanger) {
            window.wordpressChanger.testProgress();
        }
    };
});