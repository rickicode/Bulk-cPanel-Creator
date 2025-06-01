/**
 * cPanel Bulk Creator - Frontend Application (REST API Version)
 * Uses REST API polling instead of websockets
 */

class BulkCreatorApp {
    constructor() {
        this.currentProcessId = null;
        this.isProcessing = false;
        this.isWhmConnected = false;
        this.validationResults = null;
        this.processResults = null;
        this.successfulAccounts = [];
        this.pollingInterval = null;
        this.pollingFrequency = 2000; // 2 second
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
        // Always connected in REST mode - no need for connection status display
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
            
            // Cloudflare DNS
            cfEmail: document.getElementById('cfEmail'),
            cfApiKey: document.getElementById('cfApiKey'),
            cfRecordType: document.getElementById('cfRecordType'),
            cfRecordValue: document.getElementById('cfRecordValue'),
            cfValueGroup: document.getElementById('cfValueGroup'),
            cfValueHelp: document.getElementById('cfValueHelp'),
            
            // Config
            packagePlan: document.getElementById('packagePlan'),
            emailTemplate: document.getElementById('emailTemplate'),
            
            // Domains
            domainList: document.getElementById('domainList'),
            
            // Buttons
            testConnectionBtn: document.getElementById('testConnectionBtn'),
            testCfConnectionBtn: document.getElementById('testCfConnectionBtn'),
            validateDomainsBtn: document.getElementById('validateDomainsBtn'),
            clearDomainsBtn: document.getElementById('clearDomainsBtn'),
            startCreationBtn: document.getElementById('startCreationBtn'),
            stopCreationBtn: document.getElementById('stopCreationBtn'),
            clearLogsBtn: document.getElementById('clearLogsBtn'),
            exportAccountsBtn: document.getElementById('exportAccountsBtn'),
            exportAccountsCsvBtn: document.getElementById('exportAccountsCsvBtn'),
            
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
            successfulAccountsSection: document.getElementById('successfulAccountsSection'),
            successfulAccountsList: document.getElementById('successfulAccountsList'),
            successfulAccountsCount: document.getElementById('successfulAccountsCount'),
            
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

        // Email template and package plan input changes
        this.elements.emailTemplate.addEventListener('input', () => {
            this.saveFormData();
        });
        
        this.elements.packagePlan.addEventListener('change', () => {
            this.saveFormData();
        });

        // Cloudflare form input changes
        ['cfEmail', 'cfApiKey', 'cfRecordValue'].forEach(field => {
            this.elements[field].addEventListener('input', () => {
                this.validateCloudflareFields();
            });
        });

        // SSL select change
        this.elements.whmSsl.addEventListener('change', () => {
            this.validateCredentialFields();
        });

        // Cloudflare record type change
        this.elements.cfRecordType.addEventListener('change', () => {
            this.toggleCloudflareRecordType();
            this.validateCloudflareFields();
        });

        this.elements.domainList.addEventListener('input', () => {
            // Clear previous data when user starts typing new domains
            if (this.currentProcessId || this.successfulAccounts.length > 0) {
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
        this.elements.testConnectionBtn.addEventListener('click', () => {
            this.testWhmConnection();
        });

        this.elements.testCfConnectionBtn.addEventListener('click', () => {
            this.testCloudflareConnection();
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


        this.elements.exportAccountsBtn.addEventListener('click', () => {
            this.exportAccountsToTxt();
        });

        this.elements.exportAccountsCsvBtn.addEventListener('click', () => {
            this.exportAccountsToCsv();
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
        
        // Save WHM connection data whenever valid data is entered
        if (isValid) {
            this.saveWhmConnectionData();
        }
    }

    /**
     * Validate Cloudflare credentials and enable/disable test button
     */
    validateCloudflareFields() {
        const email = this.elements.cfEmail.value.trim();
        const apiKey = this.elements.cfApiKey.value.trim();
        const recordValue = this.elements.cfRecordValue.value.trim();

        const isValid = email && apiKey && recordValue;
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
     * Update connection status display (placeholder for REST mode)
     */
    updateConnectionStatus(status) {
        // No UI elements for connection status in REST mode
        console.log('Connection status:', status);
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
     * Handle process status updates
     */
    handleProcessStatus(status) {
        // Update progress
        if (status.progress) {
            this.handleProgress(status.progress);
        }

        // Handle completion or failure
        if (status.status === 'completed') {
            this.handleProcessCompleted(status);
        } else if (status.status === 'failed') {
            this.handleProcessFailed(status);
        }
    }

    /**
     * Handle new logs from polling
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
                    this.elements.whmSsl.value = savedWhmData.ssl !== false ? 'true' : 'false';
                    this.elements.authMethod.value = savedWhmData.authMethod || 'token';
                    
                    // Load sensitive data
                    if (savedWhmData.apiToken) {
                        this.elements.whmApiToken.value = savedWhmData.apiToken;
                        console.log('Loaded API token from localStorage');
                    }
                    if (savedWhmData.password) {
                        this.elements.whmPassword.value = savedWhmData.password;
                        console.log('Loaded password from localStorage');
                    }
                    
                    console.log('WHM connection data loaded from localStorage:', {
                        authMethod: savedWhmData.authMethod,
                        hasApiToken: !!savedWhmData.apiToken,
                        hasPassword: !!savedWhmData.password,
                        host: savedWhmData.host
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load saved WHM connection data:', error);
        }

        // Load saved Cloudflare connection data if exists
        try {
            const savedCfDataEncoded = localStorage.getItem('bulkCreator_cloudflareConnection');
            if (savedCfDataEncoded) {
                let savedCfData;
                try {
                    savedCfData = JSON.parse(atob(savedCfDataEncoded));
                } catch (e) {
                    // Fallback for old unencoded format
                    savedCfData = JSON.parse(savedCfDataEncoded);
                }
                
                if (savedCfData.email) {
                    this.elements.cfEmail.value = savedCfData.email || '';
                    this.elements.cfApiKey.value = savedCfData.apiKey || '';
                    this.elements.cfRecordType.value = savedCfData.recordType || 'A';
                    this.elements.cfRecordValue.value = savedCfData.recordValue || '';
                }
            }
        } catch (error) {
            console.warn('Failed to load saved Cloudflare connection data:', error);
        }

        this.toggleAuthMethod();
        this.toggleCloudflareRecordType();
        
        // Ensure validation runs after data is loaded
        setTimeout(() => {
            this.validateCredentialFields();
            this.validateCloudflareFields();
            this.validateDomainFields();
        }, 100);
    }

    /**
     * Save form data to localStorage
     */
    saveFormData() {
        const formData = {};
        
        const fieldsToSave = [
            'emailTemplate',
            'packagePlan',
            'domainList'
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
            ssl: this.elements.whmSsl.value === 'true',
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
        
        // Debug log to verify saving
        console.log('WHM connection data saved to localStorage:', {
            authMethod: whmData.authMethod,
            hasApiToken: !!whmData.apiToken,
            hasPassword: !!whmData.password,
            host: whmData.host
        });
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
     * Get Cloudflare credentials from form
     */
    getCloudflareCredentials() {
        return {
            email: this.elements.cfEmail.value.trim(),
            apiKey: this.elements.cfApiKey.value.trim(),
            recordType: this.elements.cfRecordType.value,
            recordValue: this.elements.cfRecordValue.value.trim()
        };
    }

    /**
     * Save Cloudflare connection data to localStorage
     */
    saveCloudflareConnectionData() {
        const cfData = {
            email: this.elements.cfEmail.value.trim(),
            apiKey: this.elements.cfApiKey.value.trim(),
            recordType: this.elements.cfRecordType.value,
            recordValue: this.elements.cfRecordValue.value.trim()
        };

        // Simple encoding for localStorage (not real encryption, but better than plain text)
        const encodedData = btoa(JSON.stringify(cfData));
        localStorage.setItem('bulkCreator_cloudflareConnection', encodedData);
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
                
                // Load available packages only if not already connected or packages not loaded
                if (!this.isWhmConnected || !this.elements.packagePlan || this.elements.packagePlan.options.length <= 1) {
                    this.loadPackages();
                }
                
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
     * Test Cloudflare connection
     */
    async testCloudflareConnection() {
        this.showLoading('Testing Cloudflare connection...');
        
        try {
            const credentials = this.getCloudflareCredentials();
            
            const response = await fetch('/api/cloudflare/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ cloudflareCredentials: credentials })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('success', `Cloudflare connection successful! Account: ${result.data.email}`);
                this.addLog('info', `Cloudflare connection verified - Account: ${result.data.email}`);
                
                // Save Cloudflare connection data for future use
                this.saveCloudflareConnectionData();
                
                // Mark Cloudflare as connected
                this.isCloudflareConnected = true;
            } else {
                this.showToast('error', `Cloudflare connection failed: ${result.error}`);
                this.addLog('error', `Cloudflare connection failed: ${result.error}`);
                this.isCloudflareConnected = false;
            }

        } catch (error) {
            console.error('Cloudflare test error:', error);
            this.showToast('error', 'Failed to test Cloudflare connection');
            this.addLog('error', `Cloudflare connection test error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Load available packages from WHM
     */
    async loadPackages() {
        try {
            console.log('Loading packages from WHM...');
            const credentials = this.getWhmCredentials();
            
            const response = await fetch('/api/whm/packages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ whmCredentials: credentials })
            });

            const result = await response.json();
            console.log('Packages response:', result);
            
            if (result.success && result.data && result.data.packages) {
                console.log('Found packages:', result.data.packages);
                this.populatePackageSelect(result.data.packages);
            } else {
                console.error('No packages found or error:', result);
                this.addLog('warn', 'No packages found from WHM server');
            }
        } catch (error) {
            console.error('Failed to load packages:', error);
            this.addLog('error', `Failed to load packages: ${error.message}`);
        }
    }

    /**
     * Populate package select with available plans
     */
    populatePackageSelect(packages) {
        if (!this.elements.packagePlan) return;
        
        // Clear all existing options
        this.elements.packagePlan.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.textContent = 'Select a package plan';
        defaultOption.disabled = true;
        this.elements.packagePlan.appendChild(defaultOption);

        // Add packages
        packages.forEach((pkg, index) => {
            const option = document.createElement('option');
            option.value = pkg.name;
            option.textContent = pkg.name;
            this.elements.packagePlan.appendChild(option);
        });
        
        // Auto-select first package if available
        if (packages.length > 0) {
            this.elements.packagePlan.value = packages[0].name;
            this.addLog('info', `Auto-selected package: ${packages[0].name}`);
        }
    }

    /**
     * Validate domains list
     */
    async validateDomains() {
        this.showLoading('Validating domains...');
        
        try {
            const domains = this.elements.domainList.value.trim();
            
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
        this.elements.domainValidation.classList.remove('hidden');
        
        // Update counts
        this.elements.totalDomains.textContent = data.total;
        this.elements.validDomains.textContent = data.summary.validCount;
        this.elements.invalidDomains.textContent = data.summary.invalidCount;
        this.elements.duplicateDomains.textContent = data.summary.duplicateCount;
        
        // Show/hide invalid domains list
        if (data.invalid.length > 0) {
            this.elements.invalidList.classList.remove('hidden');
            this.elements.invalidDomainsUl.innerHTML = '';
            data.invalid.forEach(domain => {
                const li = document.createElement('li');
                li.textContent = domain;
                this.elements.invalidDomainsUl.appendChild(li);
            });
        } else {
            this.elements.invalidList.classList.add('hidden');
        }
        
        // Show/hide duplicate domains list
        if (data.duplicates.length > 0) {
            this.elements.duplicateList.classList.remove('hidden');
            this.elements.duplicateDomainsUl.innerHTML = '';
            data.duplicates.forEach(domain => {
                const li = document.createElement('li');
                li.textContent = domain;
                this.elements.duplicateDomainsUl.appendChild(li);
            });
        } else {
            this.elements.duplicateList.classList.add('hidden');
        }
    }

    /**
     * Clear domains input and validation
     */
    clearDomains() {
        this.elements.domainList.value = '';
        this.elements.domainValidation.classList.add('hidden');
        this.validationResults = null;
        this.updateStartButtonState();
        
        // Clear previous bulk creation data
        if (this.currentProcessId || this.successfulAccounts.length > 0) {
            this.clearPreviousData();
            this.showToast('info', 'Domains and previous data cleared');
        } else {
            this.showToast('info', 'Domains cleared');
        }
    }

    /**
     * Start bulk account creation
     */
    async startBulkCreation() {
        if (!this.validationResults || this.validationResults.valid.length === 0) {
            this.showToast('error', 'Please validate domains first');
            return;
        }

        // Clear previous data before starting new bulk creation
        this.clearPreviousData();

        this.showLoading('Starting bulk creation...');
        
        try {
            const requestData = {
                whmCredentials: this.getWhmCredentials(),
                domains: this.validationResults.valid,
                plan: this.elements.packagePlan.value,
                emailTemplate: this.elements.emailTemplate.value.trim() || 'admin@{domain}'
            };

            // Add Cloudflare credentials if provided
            const cfEmail = this.elements.cfEmail.value.trim();
            const cfApiKey = this.elements.cfApiKey.value.trim();
            if (cfEmail && cfApiKey) {
                requestData.cloudflareCredentials = this.getCloudflareCredentials();
            }

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
                this.lastLogCount = 0;
                
                // Show monitoring section
                this.elements.monitorSection.classList.remove('hidden');
                this.elements.startCreationBtn.disabled = true;
                this.elements.stopCreationBtn.disabled = false;
                
                // Start polling for updates
                this.startPolling();
                
                this.showToast('success', `Bulk creation started! Process ID: ${result.processId}`);
                this.addLog('info', `Bulk creation started - Process ID: ${result.processId}`);
                this.addLog('info', `Total domains to process: ${result.totalDomains}`);
                
                if (result.invalidDomains > 0) {
                    this.addLog('warn', `${result.invalidDomains} invalid domains will be skipped`);
                }
                if (result.duplicateDomains > 0) {
                    this.addLog('warn', `${result.duplicateDomains} duplicate domains will be skipped`);
                }
            } else {
                this.showToast('error', `Failed to start creation: ${result.error}`);
                this.addLog('error', `Bulk creation failed: ${result.error}`);
            }

        } catch (error) {
            console.error('Bulk creation error:', error);
            this.showToast('error', 'Failed to start bulk creation');
            this.addLog('error', `Bulk creation error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Stop bulk creation
     */
    async stopBulkCreation() {
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
                this.elements.startCreationBtn.disabled = false;
                this.elements.stopCreationBtn.disabled = true;
                
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
     * Handle process started event
     */
    handleProcessStarted(data) {
        this.addLog('info', 'Process started successfully');
    }

    /**
     * Handle progress update
     */
    handleProgress(data) {
        this.updateProgress(data.current, data.total, data.status);
        
        // Update counts
        this.elements.processedCount.textContent = data.current || 0;
        this.elements.successCount.textContent = data.successful || 0;
        this.elements.failedCount.textContent = data.failed || 0;
        this.elements.skippedCount.textContent = data.skipped || 0;
    }

    /**
     * Handle log message
     */
    handleLog(data) {
        // Format message without showing raw JSON data
        let message = data.message;
        
        // If there's account data, format it nicely
        if (data.data) {
            if (data.data.domain && data.data.username) {
                message += ` (Domain: ${data.data.domain}, Username: ${data.data.username})`;
            } else if (data.data.domain) {
                message += ` (Domain: ${data.data.domain})`;
            } else if (data.data.totalDomains !== undefined) {
                message += ` (Total: ${data.data.totalDomains}, Invalid: ${data.data.invalidDomains || 0}, Duplicates: ${data.data.duplicateDomains || 0})`;
            }
        }
        
        this.addLog(data.level, message);
        
        // Check for successful account creation
        if (data.level === 'info' && data.message && data.message.includes('Account created successfully')) {
            this.addSuccessfulAccountFromLog(data);
        }
    }

    /**
     * Add successful account from log data
     */
    addSuccessfulAccountFromLog(logData) {
        if (logData.data && logData.data.domain && logData.data.username) {
            // Create account data directly from log data
            const accountData = {
                domain: logData.data.domain,
                username: logData.data.username,
                email: logData.data.email || `admin@${logData.data.domain}`,
                password: logData.data.password || 'Password Generated',
                timestamp: new Date().toISOString()
            };
            
            this.addSuccessfulAccount(accountData);
        }
    }

    /**
     * Load partial account data for successful accounts
     */
    async loadPartialAccountData(domain, username) {
        try {
            if (this.currentProcessId) {
                // Fetch account details from the API
                const response = await fetch(`/api/process/${this.currentProcessId}/accounts`);
                const result = await response.json();
                
                if (result.success && result.data && result.data.successful) {
                    // Find the account with matching domain and username
                    const account = result.data.successful.find(acc =>
                        acc.domain === domain && acc.username === username
                    );
                    
                    if (account && account.password) {
                        const accountData = {
                            domain,
                            username,
                            email: account.email || `admin@${domain}`,
                            password: account.password,
                            timestamp: new Date().toISOString()
                        };
                        
                        this.addSuccessfulAccount(accountData);
                        return;
                    }
                }
            }
            
            // Fallback if API call fails
            const accountData = {
                domain,
                username,
                email: `admin@${domain}`,
                password: 'Not Available',
                timestamp: new Date().toISOString()
            };
            
            this.addSuccessfulAccount(accountData);
        } catch (error) {
            console.error('Failed to load account data:', error);
            
            // Fallback account data
            const accountData = {
                domain,
                username,
                email: `admin@${domain}`,
                password: 'Not Available',
                timestamp: new Date().toISOString()
            };
            
            this.addSuccessfulAccount(accountData);
        }
    }

    /**
     * Handle process completion
     */
    handleProcessCompleted(data) {
        this.stopPolling();
        this.isProcessing = false;
        this.elements.startCreationBtn.disabled = false;
        this.elements.stopCreationBtn.disabled = true;
        
        this.addLog('info', 'Bulk creation process completed successfully!');
        this.addLog('info', `Total processed: ${data.results?.totalProcessed || 0}`);
        this.addLog('info', `Successful: ${data.results?.successful || 0}`);
        this.addLog('info', `Failed: ${data.results?.failed || 0}`);
        this.addLog('info', `Skipped: ${data.results?.skipped || 0}`);
        
        this.showToast('success', 'Bulk creation completed!');
        
        // Load final results
        this.loadProcessResults();
    }

    /**
     * Handle process failure
     */
    handleProcessFailed(data) {
        this.stopPolling();
        this.isProcessing = false;
        this.elements.startCreationBtn.disabled = false;
        this.elements.stopCreationBtn.disabled = true;
        
        this.addLog('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
        this.showToast('error', `Process failed: ${data.error?.message || 'Unknown error'}`);
    }

    /**
     * Update progress display
     */
    updateProgress(current, total, text) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        this.elements.progressPercentage.textContent = `${percentage}%`;
        this.elements.progressFill.style.width = `${percentage}%`;
        this.elements.progressText.textContent = text || `${current}/${total}`;
    }

    /**
     * Add log entry to the UI
     */
    addLog(level, message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = timestamp;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = message;
        
        logEntry.appendChild(timeSpan);
        logEntry.appendChild(messageSpan);
        
        // Remove JSON data display - data is now formatted in the message itself
        
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
        this.showToast('info', 'Logs cleared');
    }

    /**
     * Load process results for display
     */
    async loadProcessResults() {
        if (!this.currentProcessId) return;

        try {
            const response = await fetch(`/api/process/${this.currentProcessId}/status`);
            const result = await response.json();

            if (result.success && result.data.results) {
                this.processResults = result.data.results;
                // Results are now displayed in Successful Accounts section only
            }
        } catch (error) {
            console.error('Failed to load process results:', error);
        }
    }

    /**
     * Clear successful accounts list
     */
    clearSuccessfulAccountsList() {
        this.elements.successfulAccountsList.innerHTML = '';
        this.successfulAccounts = [];
        this.elements.successfulAccountsCount.textContent = '0';
    }

    /**
     * Clear all previous data before starting new bulk creation
     */
    clearPreviousData() {
        // Clear successful accounts
        this.clearSuccessfulAccountsList();
        
        // Hide successful accounts section
        this.elements.successfulAccountsSection.classList.add('hidden');
        
        // Reset progress bar
        this.updateProgress(0, 0, 'Initializing...');
        
        // Reset statistics counters
        this.elements.processedCount.textContent = '0';
        this.elements.successCount.textContent = '0';
        this.elements.failedCount.textContent = '0';
        this.elements.skippedCount.textContent = '0';
        
        // Clear logs
        this.elements.logsContent.innerHTML = '';
        
        // Hide monitor section initially
        this.elements.monitorSection.classList.add('hidden');
        
        // Reset process state
        this.currentProcessId = null;
        this.lastLogCount = 0;
        
        // Show toast notification
        this.showToast('info', 'Previous data cleared. Starting fresh...');
    }

    /**
     * Add successful account to the list
     */
    addSuccessfulAccount(accountData) {
        this.successfulAccounts.push(accountData);

        // Update counter
        this.elements.successfulAccountsCount.textContent = this.successfulAccounts.length;

        const accountDiv = document.createElement('div');
        accountDiv.className = 'account-item';
        accountDiv.innerHTML = `
            <div class="account-header">
                <h4 class="account-domain">${accountData.domain}</h4>
                <span class="account-status">✓ Created Successfully</span>
            </div>
            <div class="account-details">
                <div class="account-info">
                    <div class="info-row">
                        <strong>Username:</strong>
                        <span class="selectable">${accountData.username}</span>
                        <button class="copy-btn" data-copy="${accountData.username}">📋</button>
                    </div>
                    <div class="info-row">
                        <strong>Password:</strong>
                        <span class="selectable password-field">${accountData.password}</span>
                        <button class="copy-btn" data-copy="${accountData.password}">📋</button>
                    </div>
                    <div class="info-row">
                        <strong>Email:</strong>
                        <span class="selectable">${accountData.email}</span>
                        <button class="copy-btn" data-copy="${accountData.email}">📋</button>
                    </div>
                    <div class="info-row">
                        <strong>cPanel Login:</strong>
                        <a href="https://${accountData.domain}:2083" target="_blank" class="login-link">
                            https://${accountData.domain}:2083
                        </a>
                        <button class="copy-btn" data-copy="https://${accountData.domain}:2083">📋</button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners to copy buttons
        const copyButtons = accountDiv.querySelectorAll('.copy-btn');
        copyButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const textToCopy = e.target.getAttribute('data-copy');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // Visual feedback
                    const originalText = e.target.textContent;
                    e.target.textContent = '✓';
                    setTimeout(() => {
                        e.target.textContent = originalText;
                    }, 1000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            });
        });

        this.elements.successfulAccountsList.appendChild(accountDiv);
        this.elements.successfulAccountsSection.classList.remove('hidden');

        // Auto scroll to show new account
        accountDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Export successful accounts to TXT format
     */
    exportAccountsToTxt() {
        if (!this.successfulAccounts || this.successfulAccounts.length === 0) {
            this.showToast('error', 'No successful accounts to export');
            return;
        }

        let txtContent = '';
        this.successfulAccounts.forEach((account, index) => {
            if (index > 0) txtContent += '\n';
            txtContent += `Username: ${account.username}\n`;
            txtContent += `Password: ${account.password}\n`;
            txtContent += `Domain: ${account.domain}\n`;
            txtContent += `Login: https://${account.domain}:2083\n`;
            txtContent += '---\n';
        });

        const blob = new Blob([txtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cpanel-accounts-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('success', 'Accounts exported to TXT file');
    }

    /**
     * Export successful accounts to CSV format
     */
    exportAccountsToCsv() {
        if (!this.successfulAccounts || this.successfulAccounts.length === 0) {
            this.showToast('error', 'No successful accounts to export');
            return;
        }

        const headers = ['Domain', 'Username', 'Password', 'Email', 'cPanel Login'];
        const rows = [];

        this.successfulAccounts.forEach(account => {
            rows.push([
                account.domain,
                account.username,
                account.password,
                account.email,
                `https://${account.domain}:2083`
            ]);
        });

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cpanel-accounts-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('success', 'Accounts exported to CSV file');
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BulkCreatorApp();
});