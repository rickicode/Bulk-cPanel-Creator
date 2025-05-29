/**
 * cPanel Bulk Creator - Frontend Application
 * Minimalist design with particle effects
 */

class BulkCreatorApp {
    constructor() {
        this.socket = null;
        this.currentProcessId = null;
        this.isProcessing = false;
        this.isWhmConnected = false;
        this.validationResults = null;
        this.processResults = null;
        this.successfulAccounts = [];
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.initializeElements();
        this.initializeParticles();
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadFormDefaults();
    }

    /**
     * Initialize particle background with CSS animation
     */
    initializeParticles() {
        const particlesContainer = document.getElementById('particles-js');
        if (!particlesContainer) return;

        // Create particles using CSS animations
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // Random positioning and animation properties
            const size = Math.random() * 4 + 2;
            const left = Math.random() * 100;
            const animationDuration = Math.random() * 20 + 10;
            const animationDelay = Math.random() * 20;
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: #3b82f6;
                border-radius: 50%;
                left: ${left}%;
                opacity: ${Math.random() * 0.5 + 0.1};
                animation: float ${animationDuration}s linear infinite;
                animation-delay: ${animationDelay}s;
            `;
            
            particlesContainer.appendChild(particle);
        }
    }

    /**
     * Get DOM elements and store references
     */
    initializeElements() {
        this.elements = {
            // Credentials
            whmHost: document.getElementById('whmHost'),
            whmPort: document.getElementById('whmPort'),
            whmUsername: document.getElementById('whmUsername'),
            whmSsl: document.getElementById('whmSsl'),
            authMethod: document.getElementById('authMethod'),
            whmApiToken: document.getElementById('whmApiToken'),
            whmPassword: document.getElementById('whmPassword'),
            
            // Config
            packagePlan: document.getElementById('packagePlan'),
            quota: document.getElementById('quota'),
            bwlimit: document.getElementById('bwlimit'),
            hasshell: document.getElementById('hasshell'),
            cgi: document.getElementById('cgi'),
            
            // Domains
            domainList: document.getElementById('domainList'),
            
            // Buttons
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            validateDomainsBtn: document.getElementById('validateDomainsBtn'),
            clearDomainsBtn: document.getElementById('clearDomainsBtn'),
            startCreationBtn: document.getElementById('startCreationBtn'),
            stopCreationBtn: document.getElementById('stopCreationBtn'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            exportTextBtn: document.getElementById('exportTextBtn'),
            copyResultsBtn: document.getElementById('copyResultsBtn'),
            downloadCsvBtn: document.getElementById('downloadCsvBtn'),
            
            // Status displays
            connectionStatus: document.getElementById('connectionStatus'),
            statusText: document.getElementById('statusText'),
            progressText: document.getElementById('progressText'),
            progressPercentage: document.getElementById('progressPercentage'),
            progressFill: document.getElementById('progressFill'),
            processedCount: document.getElementById('processedCount'),
            successCount: document.getElementById('successCount'),
            failedCount: document.getElementById('failedCount'),
            skippedCount: document.getElementById('skippedCount'),
            
            // Sections
            monitorSection: document.getElementById('monitorSection'),
            successfulAccountsSection: document.getElementById('successfulAccountsSection'),
            successfulAccountsList: document.getElementById('successfulAccountsList'),
            resultsSection: document.getElementById('resultsSection'),
            
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
            
            // Results
            resultsFilter: document.getElementById('resultsFilter'),
            resultsTable: document.getElementById('resultsTable'),
            resultsTableBody: document.getElementById('resultsTableBody'),
            
            // Loading
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            
            // Toast container
            toastContainer: document.getElementById('toastContainer'),

            // Group elements
            apiTokenGroup: document.getElementById('apiTokenGroup'),
            passwordGroup: document.getElementById('passwordGroup')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Authentication method change
        this.elements.authMethod.addEventListener('change', () => {
            this.toggleAuthMethod();
        });

        // Form input changes
        ['whmHost', 'whmPort', 'whmUsername', 'whmApiToken', 'whmPassword'].forEach(field => {
            this.elements[field].addEventListener('input', () => {
                this.validateCredentialFields();
            });
        });

        // SSL checkbox change
        this.elements.whmSsl.addEventListener('change', () => {
            this.validateCredentialFields();
        });

        this.elements.domainList.addEventListener('input', () => {
            this.validateDomainFields();
        });

        // Button clicks
        this.elements.testConnectionBtn.addEventListener('click', () => {
            this.testWhmConnection();
        });

        this.elements.validateDomainsBtn.addEventListener('click', () => {
            this.validateDomains();
        });

        this.elements.clearDomainsBtn.addEventListener('click', () => {
            this.clearDomains();
        });

        this.elements.startCreationBtn.addEventListener('click', () => {
            this.startBulkCreation();
        });

        this.elements.stopCreationBtn.addEventListener('click', () => {
            this.stopBulkCreation();
        });

        this.elements.clearLogsBtn.addEventListener('click', () => {
            this.clearLogs();
        });

        this.elements.exportTextBtn.addEventListener('click', () => {
            this.exportAsText();
        });

        this.elements.copyResultsBtn.addEventListener('click', () => {
            this.copyResultsToClipboard();
        });

        this.elements.downloadCsvBtn.addEventListener('click', () => {
            this.downloadCsv();
        });

        // Results filter
        this.elements.resultsFilter.addEventListener('change', () => {
            this.filterResults();
        });

        // Auto-scroll logs
        this.elements.autoScrollLogs.addEventListener('change', () => {
            if (this.elements.autoScrollLogs.checked) {
                this.scrollLogsToBottom();
            }
        });
    }

    /**
     * Toggle authentication method UI
     */
    toggleAuthMethod() {
        const method = this.elements.authMethod.value;
        
        if (method === 'token') {
            this.elements.apiTokenGroup.classList.remove('hidden');
            this.elements.passwordGroup.classList.add('hidden');
            this.elements.whmPassword.value = '';
        } else {
            this.elements.apiTokenGroup.classList.add('hidden');
            this.elements.passwordGroup.classList.remove('hidden');
            this.elements.whmApiToken.value = '';
        }

        this.validateCredentialFields();
    }

    /**
     * Validate credential fields and enable/disable test button
     */
    validateCredentialFields() {
        const host = this.elements.whmHost.value.trim();
        const username = this.elements.whmUsername.value.trim();
        const method = this.elements.authMethod.value;
        const token = this.elements.whmApiToken.value.trim();
        const password = this.elements.whmPassword.value.trim();

        const isValid = host && username && 
            ((method === 'token' && token) || (method === 'password' && password));

        this.elements.testConnectionBtn.disabled = !isValid;
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
     * Update start button state based on all requirements
     */
    updateStartButtonState() {
        const hasDomains = this.elements.domainList.value.trim();
        const hasValidDomains = this.validationResults && this.validationResults.valid.length > 0;
        
        this.elements.startCreationBtn.disabled = !this.isWhmConnected || !hasValidDomains || this.isProcessing;
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        this.updateConnectionStatus('connecting');
        
        try {
            this.socket = io();

            this.socket.on('connect', () => {
                this.updateConnectionStatus('connected');
                this.addLog('info', 'Connected to server');
            });

            this.socket.on('disconnect', () => {
                this.updateConnectionStatus('disconnected');
                this.addLog('warn', 'Disconnected from server');
            });

            this.socket.on('connected', (data) => {
                this.addLog('info', data.message);
            });

            this.socket.on('process-started', (data) => {
                this.handleProcessStarted(data);
            });

            this.socket.on('progress', (data) => {
                this.handleProgress(data);
            });

            this.socket.on('log', (data) => {
                this.handleLog(data);
            });

            this.socket.on('process-completed', (data) => {
                this.handleProcessCompleted(data);
            });

            this.socket.on('process-failed', (data) => {
                this.handleProcessFailed(data);
            });

        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.updateConnectionStatus('disconnected');
            this.showToast('error', 'Failed to connect to server');
        }
    }

    /**
     * Update connection status display
     */
    updateConnectionStatus(status) {
        this.elements.statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.elements.connectionStatus.className = `connection-status ${status}`;
    }

    /**
     * Load form defaults from localStorage
     */
    loadFormDefaults() {
        const savedValues = JSON.parse(localStorage.getItem('bulkCreator_formData') || '{}');
        
        Object.keys(savedValues).forEach(key => {
            if (this.elements[key]) {
                if (this.elements[key].type === 'checkbox') {
                    this.elements[key].checked = savedValues[key];
                } else {
                    this.elements[key].value = savedValues[key];
                }
            }
        });

        // Load saved WHM connection data if exists
        try {
            const savedWhmDataEncoded = localStorage.getItem('bulkCreator_whmConnection');
            if (savedWhmDataEncoded) {
                // Try to decode the data (handle both old and new formats)
                let savedWhmData;
                try {
                    savedWhmData = JSON.parse(atob(savedWhmDataEncoded));
                } catch (e) {
                    // Fallback for old unencoded format
                    savedWhmData = JSON.parse(savedWhmDataEncoded);
                }
                
                if (savedWhmData.host) {
                    this.elements.whmHost.value = savedWhmData.host || '';
                    this.elements.whmPort.value = savedWhmData.port || '2087';
                    this.elements.whmUsername.value = savedWhmData.username || '';
                    this.elements.whmSsl.checked = savedWhmData.ssl !== false;
                    this.elements.authMethod.value = savedWhmData.authMethod || 'token';
                    
                    // Load sensitive data
                    if (savedWhmData.apiToken) {
                        this.elements.whmApiToken.value = savedWhmData.apiToken;
                    }
                    if (savedWhmData.password) {
                        this.elements.whmPassword.value = savedWhmData.password;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load saved WHM connection data:', error);
        }

        this.toggleAuthMethod();
        
        // Ensure validation runs after data is loaded
        setTimeout(() => {
            this.validateCredentialFields();
            this.validateDomainFields();
        }, 100);
    }

    /**
     * Save form data to localStorage
     */
    saveFormData() {
        const formData = {};
        
        const fieldsToSave = [
            'quota', 'bwlimit', 'hasshell', 'cgi'
        ];

        fieldsToSave.forEach(field => {
            if (this.elements[field]) {
                if (this.elements[field].type === 'checkbox') {
                    formData[field] = this.elements[field].checked;
                } else {
                    formData[field] = this.elements[field].value;
                }
            }
        });

        localStorage.setItem('bulkCreator_formData', JSON.stringify(formData));
    }

    /**
     * Save WHM connection data to localStorage (including sensitive data)
     */
    saveWhmConnectionData() {
        const whmData = {
            host: this.elements.whmHost.value.trim(),
            port: this.elements.whmPort.value,
            username: this.elements.whmUsername.value.trim(),
            ssl: this.elements.whmSsl.checked,
            authMethod: this.elements.authMethod.value
        };

        // Save sensitive data based on authentication method
        if (this.elements.authMethod.value === 'token') {
            whmData.apiToken = this.elements.whmApiToken.value.trim();
        } else {
            whmData.password = this.elements.whmPassword.value.trim();
        }

        // Simple encoding for localStorage (not real encryption, but better than plain text)
        const encodedData = btoa(JSON.stringify(whmData));
        localStorage.setItem('bulkCreator_whmConnection', encodedData);
    }

    /**
     * Get WHM credentials from form
     */
    getWhmCredentials() {
        return {
            host: this.elements.whmHost.value.trim(),
            port: parseInt(this.elements.whmPort.value) || 2087,
            username: this.elements.whmUsername.value.trim(),
            ssl: this.elements.whmSsl.checked,
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
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ whmCredentials: credentials })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', `Connection successful! WHM ${result.data.version}`);
                this.addLog('info', `WHM connection verified - Version: ${result.data.version}`);
                
                // Save WHM connection data for future use
                this.saveWhmConnectionData();
                this.saveFormData();
                
                // Load available packages
                this.loadPackages();
                
                // Mark connection as verified
                this.isWhmConnected = true;
                this.updateStartButtonState();
            } else {
                this.showToast('error', `Connection failed: ${result.error}`);
                this.addLog('error', `WHM connection failed: ${result.error}`);
                this.isWhmConnected = false;
            }

        } catch (error) {
            console.error('WHM test error:', error);
            this.showToast('error', 'Failed to test connection');
            this.addLog('error', `Connection test error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Load available packages from WHM
     */
    async loadPackages() {
        try {
            const credentials = this.getWhmCredentials();
            const params = new URLSearchParams({
                whmCredentials: JSON.stringify(credentials)
            });

            const response = await fetch(`/api/whm/packages?${params}`);
            const result = await response.json();

            if (result.success) {
                this.populatePackageSelect(result.data);
                this.addLog('info', `Loaded ${result.data.length} packages`);
            }

        } catch (error) {
            console.error('Package loading error:', error);
        }
    }

    /**
     * Populate package select dropdown
     */
    populatePackageSelect(packages) {
        const select = this.elements.packagePlan;
        
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }

        packages.forEach((pkg, index) => {
            const option = document.createElement('option');
            option.value = pkg.name;
            option.textContent = `${pkg.name} (${pkg.quota} disk, ${pkg.bwlimit} bandwidth)`;
            select.appendChild(option);
        });

        // Automatically select the first package if available
        if (packages.length > 0) {
            select.selectedIndex = 1; // Index 1 because index 0 is "Default Package"
            this.addLog('info', `Auto-selected package: ${packages[0].name}`);
        }
    }

    /**
     * Validate domains
     */
    async validateDomains() {
        const domainText = this.elements.domainList.value.trim();
        if (!domainText) {
            this.showToast('warning', 'Please enter domains to validate');
            return;
        }

        this.showLoading('Validating domains...');

        try {
            const response = await fetch('/api/bulk/validate-domains', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains: domainText })
            });

            const result = await response.json();

            if (result.success) {
                this.validationResults = result.data;
                this.displayValidationResults(result.data);
                this.updateStartButtonState();
                
                this.showToast('info', 
                    `Validation complete: ${result.data.summary.validCount} valid, ` +
                    `${result.data.summary.invalidCount} invalid, ` +
                    `${result.data.summary.duplicateCount} duplicates`
                );
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
        this.elements.totalDomains.textContent = data.total;
        this.elements.validDomains.textContent = data.summary.validCount;
        this.elements.invalidDomains.textContent = data.summary.invalidCount;
        this.elements.duplicateDomains.textContent = data.summary.duplicateCount;

        if (data.invalid.length > 0) {
            this.elements.invalidDomainsUl.innerHTML = '';
            data.invalid.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.domain} - ${item.error}`;
                this.elements.invalidDomainsUl.appendChild(li);
            });
            this.elements.invalidList.classList.remove('hidden');
        } else {
            this.elements.invalidList.classList.add('hidden');
        }

        if (data.duplicates.length > 0) {
            this.elements.duplicateDomainsUl.innerHTML = '';
            data.duplicates.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.domain;
                this.elements.duplicateDomainsUl.appendChild(li);
            });
            this.elements.duplicateList.classList.remove('hidden');
        } else {
            this.elements.duplicateList.classList.add('hidden');
        }

        this.elements.domainValidation.classList.remove('hidden');
    }

    /**
     * Clear domains
     */
    clearDomains() {
        this.elements.domainList.value = '';
        this.elements.domainValidation.classList.add('hidden');
        this.validationResults = null;
        this.validateDomainFields();
    }

    /**
     * Start bulk creation process
     */
    async startBulkCreation() {
        if (!this.validationResults || this.validationResults.valid.length === 0) {
            this.showToast('warning', 'Please validate domains first');
            return;
        }

        this.showLoading('Starting bulk creation...');

        try {
            const requestData = {
                whmCredentials: this.getWhmCredentials(),
                domains: this.validationResults.valid,
                plan: this.elements.packagePlan.value || undefined,
                quota: this.elements.quota.value.trim() || undefined,
                bwlimit: this.elements.bwlimit.value.trim() || undefined,
                hasshell: this.elements.hasshell.checked,
                cgi: this.elements.cgi.checked
            };

            const response = await fetch('/api/bulk/create', {
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
                
                this.socket.emit('subscribe-process', this.currentProcessId);
                
                this.updateStartButtonState();
                this.elements.stopCreationBtn.classList.remove('hidden');
                this.elements.startCreationBtn.classList.add('hidden');
                this.elements.monitorSection.classList.remove('hidden');
                this.elements.successfulAccountsSection.classList.remove('hidden');
                
                // Clear previous successful accounts
                this.clearSuccessfulAccountsList();
                
                this.showToast('success', 'Bulk creation started...');
                this.addLog('info', `Started bulk creation process: ${this.currentProcessId}`);
                
                this.elements.monitorSection.scrollIntoView({ behavior: 'smooth' });
                
            } else {
                this.showToast('error', `Failed to start: ${result.error}`);
            }

        } catch (error) {
            console.error('Bulk creation start error:', error);
            this.showToast('error', 'Failed to start bulk creation');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Stop bulk creation process
     */
    async stopBulkCreation() {
        if (!this.currentProcessId) {
            return;
        }

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('info', 'Process stopped');
                this.addLog('warn', 'Process stopped by user');
            } else {
                this.showToast('error', `Failed to stop process: ${result.error}`);
            }

        } catch (error) {
            console.error('Process stop error:', error);
            this.showToast('error', 'Failed to stop process');
        }
    }

    /**
     * Handle process started event
     */
    handleProcessStarted(data) {
        this.addLog('info', `Process started: ${data.processId}`);
        this.updateProgress(0, data.totalDomains, 'Starting...');
    }

    /**
     * Handle progress event
     */
    handleProgress(data) {
        this.updateProgress(data.current, data.total, data.currentItem || 'Processing...');
        
        this.elements.processedCount.textContent = data.current || 0;
        this.elements.successCount.textContent = data.successful || 0;
        this.elements.failedCount.textContent = data.failed || 0;
        this.elements.skippedCount.textContent = data.skipped || 0;
    }

    /**
     * Handle log event
     */
    handleLog(data) {
        this.addLog(data.level, data.message, data.data);
        
        // Check if this is a successful account creation log
        if (data.level === 'info' &&
            data.message &&
            data.message.includes('Account created successfully for') &&
            data.data && data.data.domain && data.data.username) {
            
            // Extract account information from the process data
            this.addSuccessfulAccountFromLog(data.data);
        }
    }

    /**
     * Add successful account from log data
     */
    addSuccessfulAccountFromLog(logData) {
        // We need to get the full account data from the process results
        // For now, we'll show partial data and update when full results are available
        if (this.currentProcessId) {
            this.loadPartialAccountData(logData.domain, logData.username);
        }
    }

    /**
     * Load partial account data for real-time display
     */
    async loadPartialAccountData(domain, username) {
        try {
            const response = await fetch(`/api/process/${this.currentProcessId}`);
            const result = await response.json();

            if (result.success && result.data.results) {
                const successfulAccount = result.data.results.successful.find(
                    account => account.domain === domain && account.username === username
                );

                if (successfulAccount) {
                    this.addSuccessfulAccount(successfulAccount);
                }
            }
        } catch (error) {
            console.warn('Failed to load account data:', error);
        }
    }

    /**
     * Handle process completed event
     */
    handleProcessCompleted(data) {
        this.isProcessing = false;
        this.elements.stopCreationBtn.classList.add('hidden');
        this.elements.startCreationBtn.classList.remove('hidden');
        this.elements.exportTextBtn.disabled = false;
        this.updateStartButtonState();
        
        this.addLog('info', `Process completed in ${Math.round(data.duration / 1000)}s`);
        this.addLog('info', `Results: ${data.successful || 0} successful, ${data.failed || 0} failed, ${data.skipped || 0} skipped`);
        
        this.updateProgress(data.total, data.total, 'Completed!');
        this.showToast('success', 'Bulk creation completed successfully');
        
        this.loadProcessResults();
    }

    /**
     * Handle process failed event
     */
    handleProcessFailed(data) {
        this.isProcessing = false;
        this.elements.stopCreationBtn.classList.add('hidden');
        this.elements.startCreationBtn.classList.remove('hidden');
        this.updateStartButtonState();
        
        this.addLog('error', `Process failed: ${data.error.message}`);
        this.showToast('error', `Process failed: ${data.error.message}`);
        
        this.updateProgress(0, 100, 'Failed');
    }

    /**
     * Update progress display
     */
    updateProgress(current, total, text) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        this.elements.progressText.textContent = text;
        this.elements.progressPercentage.textContent = `${percentage}%`;
        this.elements.progressFill.style.width = `${percentage}%`;
    }

    /**
     * Add log entry
     */
    addLog(level, message, data = null) {
        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-level ${level.toUpperCase()}">${level.toUpperCase()}</span>
            <span class="log-message">${message}</span>
        `;
        
        this.elements.logsContent.appendChild(logEntry);
        
        if (this.elements.autoScrollLogs.checked) {
            this.scrollLogsToBottom();
        }
    }

    /**
     * Scroll logs to bottom
     */
    scrollLogsToBottom() {
        this.elements.logsContent.scrollTop = this.elements.logsContent.scrollHeight;
    }

    /**
     * Clear logs
     */
    clearLogs() {
        this.elements.logsContent.innerHTML = '';
        this.addLog('info', 'Logs cleared');
    }

    /**
     * Load process results
     */
    async loadProcessResults() {
        if (!this.currentProcessId) {
            return;
        }

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}`);
            const result = await response.json();

            if (result.success && result.data.results) {
                this.processResults = result.data.results;
                this.displayResults(this.processResults);
                this.elements.resultsSection.classList.remove('hidden');
                
                setTimeout(() => {
                    this.elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
                }, 500);
            }

        } catch (error) {
            console.error('Failed to load results:', error);
        }
    }

    /**
     * Display results in table
     */
    displayResults(results) {
        const tbody = this.elements.resultsTableBody;
        tbody.innerHTML = '';

        const allResults = [
            ...results.successful.map(r => ({ ...r, resultType: 'successful' })),
            ...results.failed.map(r => ({ ...r, resultType: 'failed' })),
            ...results.skipped.map(r => ({ ...r, resultType: 'skipped' }))
        ];

        allResults.forEach(result => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.domain || ''}</td>
                <td>${result.username || ''}</td>
                <td>${result.success && result.password ? result.password : ''}</td>
                <td>${result.email || ''}</td>
                <td><span class="status-badge ${result.resultType}">${result.success ? 'Success' : (result.resultType === 'skipped' ? 'Skipped' : 'Failed')}</span></td>
                <td>${result.success ? (result.message || 'Created successfully') : (result.error || 'Unknown error')}</td>
            `;
            tbody.appendChild(row);
        });
    }

    /**
     * Filter results based on selected filter
     */
    filterResults() {
        if (!this.processResults) {
            return;
        }

        const filter = this.elements.resultsFilter.value;
        const tbody = this.elements.resultsTableBody;
        const rows = tbody.querySelectorAll('tr');

        rows.forEach(row => {
            const statusBadge = row.querySelector('.status-badge');
            if (!statusBadge) return;

            const status = statusBadge.className.split(' ')[1];
            
            if (filter === 'all') {
                row.style.display = '';
            } else if (filter === 'successful' && status === 'successful') {
                row.style.display = '';
            } else if (filter === 'failed' && status === 'failed') {
                row.style.display = '';
            } else if (filter === 'skipped' && status === 'skipped') {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * Clear successful accounts list
     */
    clearSuccessfulAccountsList() {
        this.elements.successfulAccountsList.innerHTML = `
            <div class="empty-state">
                <p>No accounts created yet. Start the bulk creation process to see results here.</p>
            </div>
        `;
        this.elements.exportTextBtn.disabled = true;
        this.successfulAccounts = [];
    }

    /**
     * Add successful account to the display
     */
    addSuccessfulAccount(accountData) {
        if (!this.successfulAccounts) {
            this.successfulAccounts = [];
        }

        this.successfulAccounts.push(accountData);

        // Remove empty state if it exists
        const emptyState = this.elements.successfulAccountsList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        // Create account item
        const accountItem = document.createElement('div');
        accountItem.className = 'account-item';
        
        // Generate login URL
        const loginUrl = `https://${accountData.domain}:2083`;
        
        accountItem.innerHTML = `
            <div class="account-header">
                <div class="account-domain">${accountData.domain}</div>
                <div class="account-status">Created</div>
            </div>
            <div class="account-details">
                <div class="account-detail">
                    <div class="account-detail-label">Username</div>
                    <div class="account-detail-value selectable" onclick="navigator.clipboard.writeText('${accountData.username}')">${accountData.username}</div>
                </div>
                <div class="account-detail">
                    <div class="account-detail-label">Password</div>
                    <div class="account-detail-value selectable" onclick="navigator.clipboard.writeText('${accountData.password}')">${accountData.password}</div>
                </div>
                <div class="account-detail">
                    <div class="account-detail-label">Login URL</div>
                    <div class="account-detail-value selectable" onclick="window.open('${loginUrl}', '_blank')">${loginUrl}</div>
                </div>
            </div>
        `;

        this.elements.successfulAccountsList.appendChild(accountItem);
        this.elements.exportTextBtn.disabled = false;

        // Scroll to bottom of accounts list
        this.elements.successfulAccountsList.scrollTop = this.elements.successfulAccountsList.scrollHeight;
    }

    /**
     * Export successful accounts as text
     */
    exportAsText() {
        if (!this.successfulAccounts || this.successfulAccounts.length === 0) {
            this.showToast('warning', 'No successful accounts to export');
            return;
        }

        let textContent = 'cPanel Account Creation Results\n';
        textContent += '='.repeat(40) + '\n\n';

        this.successfulAccounts.forEach((account, index) => {
            const loginUrl = `https://${account.domain}:2083`;
            
            textContent += `Account ${index + 1}:\n`;
            textContent += `Domain: ${account.domain}\n`;
            textContent += `Username: ${account.username}\n`;
            textContent += `Password: ${account.password}\n`;
            textContent += `Login: ${loginUrl}\n`;
            textContent += '\n' + '-'.repeat(30) + '\n\n';
        });

        // Create and download text file
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cpanel_accounts_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        this.showToast('success', 'Accounts exported as text file');
    }

    /**
     * Copy results to clipboard
     */
    async copyResultsToClipboard() {
        if (!this.processResults) {
            this.showToast('warning', 'No results to copy');
            return;
        }

        try {
            const successful = this.processResults.successful;
            let text = 'cPanel Account Creation Results\n';
            text += '================================\n\n';
            
            successful.forEach(result => {
                text += `Domain: ${result.domain}\n`;
                text += `Username: ${result.username}\n`;
                text += `Password: ${result.password}\n`;
                text += `Email: ${result.email}\n`;
                text += '---\n';
            });

            await navigator.clipboard.writeText(text);
            this.showToast('success', 'Results copied to clipboard');
        } catch (error) {
            console.error('Copy error:', error);
            this.showToast('error', 'Failed to copy results');
        }
    }

    /**
     * Download results as CSV
     */
    downloadCsv() {
        if (!this.currentProcessId) {
            this.showToast('warning', 'No results to download');
            return;
        }

        const url = `/api/process/${this.currentProcessId}/export?format=csv`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `cpanel_results_${this.currentProcessId}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showToast('info', 'CSV file downloaded');
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
        toast.textContent = message;
        
        this.elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, duration);
        
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BulkCreatorApp();
});