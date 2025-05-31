// WordPress Admin Changer Application
class WordPressAdminChanger {
    constructor() {
        this.config = {
            ssh: {
                host: '',
                port: 22,
                username: '',
                password: ''
            },
            wordpress: {
                newUsername: '',
                newPassword: ''
            }
        };
        this.domains = [];
        this.validDomains = [];
        this.isProcessing = false;
        this.processId = null;
        this.results = [];
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.initializeElements();
        this.initializeParticles();
        this.setupEventListeners();
        this.loadSavedData();
        this.updateUI();
    }

    /**
     * Get DOM elements and store references
     */
    initializeElements() {
        this.elements = {
            // Toast container
            toastContainer: document.getElementById('toastContainer'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            
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
                background: #2563eb;
                border-radius: 50%;
                left: ${left}%;
                opacity: ${Math.random() * 0.5 + 0.1};
                animation: float ${animationDuration}s linear infinite;
                animation-delay: ${animationDelay}s;
            `;
            
            particlesContainer.appendChild(particle);
        }
    }

    setupEventListeners() {
        // SSH Configuration
        document.getElementById('sshHost').addEventListener('input', () => this.updateConfig());
        document.getElementById('sshPort').addEventListener('input', () => this.updateConfig());
        document.getElementById('sshUsername').addEventListener('input', () => this.updateConfig());
        document.getElementById('sshPassword').addEventListener('input', () => this.updateConfig());
        
        // WordPress Configuration
        document.getElementById('newWpPassword').addEventListener('input', () => this.updateConfig());
        
        // Show/Hide Password
        document.getElementById('showPassword').addEventListener('change', (e) => {
            const passwordField = document.getElementById('newWpPassword');
            passwordField.type = e.target.checked ? 'text' : 'password';
        });
        
        // Domain Management
        document.getElementById('domainList').addEventListener('input', () => this.updateDomains());
        document.getElementById('validateDomainsBtn').addEventListener('click', () => this.validateDomains());
        document.getElementById('clearDomainsBtn').addEventListener('click', () => this.clearDomains());
        
        // Test Connections
        document.getElementById('testSshConnectionBtn').addEventListener('click', () => this.testSshConnection());
        
        // Process Control
        document.getElementById('startChangingBtn').addEventListener('click', () => this.startChanging());
        document.getElementById('stopChangingBtn').addEventListener('click', () => this.stopChanging());
        
        // Logs
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
        
        // Export
        document.getElementById('exportResultsBtn').addEventListener('click', () => this.exportResults());
    }

    updateConfig() {
        this.config.ssh.host = document.getElementById('sshHost').value.trim();
        this.config.ssh.port = parseInt(document.getElementById('sshPort').value) || 22;
        this.config.ssh.username = document.getElementById('sshUsername').value.trim();
        this.config.ssh.password = document.getElementById('sshPassword').value;
        
        this.config.wordpress.newPassword = document.getElementById('newWpPassword').value;
        
        this.saveData();
        this.updateUI();
    }

    updateDomains() {
        const domainText = document.getElementById('domainList').value;
        this.domains = domainText.split('\n')
            .map(domain => domain.trim())
            .filter(domain => domain.length > 0);
        
        this.saveData();
        this.updateUI();
    }

    updateUI() {
        const isConfigValid = this.isConfigurationValid();
        const hasValidDomains = this.validDomains.length > 0;
        
        // Enable/disable buttons
        document.getElementById('testSshConnectionBtn').disabled = !this.config.ssh.host || !this.config.ssh.username;
        document.getElementById('validateDomainsBtn').disabled = this.domains.length === 0;
        document.getElementById('startChangingBtn').disabled = !isConfigValid || !hasValidDomains || this.isProcessing;
        document.getElementById('stopChangingBtn').disabled = !this.isProcessing;
        
        // Update status
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        
        if (this.isProcessing) {
            statusText.textContent = 'Processing';
            statusDot.className = 'status-dot status-processing';
        } else if (isConfigValid && hasValidDomains) {
            statusText.textContent = 'Ready';
            statusDot.className = 'status-dot status-success';
        } else {
            statusText.textContent = 'Waiting';
            statusDot.className = 'status-dot';
        }
    }

    isConfigurationValid() {
        return (
            this.config.ssh.host &&
            this.config.ssh.username &&
            this.config.ssh.password &&
            this.config.wordpress.newPassword
        );
    }

    validateDomains() {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        const validDomains = [];
        const invalidDomains = [];
        const duplicates = [];
        const seen = new Set();
        
        for (const domain of this.domains) {
            if (!domainRegex.test(domain)) {
                invalidDomains.push(domain);
            } else if (seen.has(domain)) {
                duplicates.push(domain);
            } else {
                seen.add(domain);
                validDomains.push(domain);
            }
        }
        
        this.validDomains = validDomains;
        this.displayValidationResults(validDomains, invalidDomains, duplicates);
        this.updateUI();
    }

    displayValidationResults(valid, invalid, duplicates) {
        document.getElementById('totalDomains').textContent = this.domains.length;
        document.getElementById('validDomains').textContent = valid.length;
        document.getElementById('invalidDomains').textContent = invalid.length;
        document.getElementById('duplicateDomains').textContent = duplicates.length;
        
        // Show invalid domains
        const invalidList = document.getElementById('invalidList');
        const invalidUl = document.getElementById('invalidDomainsUl');
        if (invalid.length > 0) {
            invalidUl.innerHTML = invalid.map(domain => `<li>${domain}</li>`).join('');
            invalidList.classList.remove('hidden');
        } else {
            invalidList.classList.add('hidden');
        }
        
        // Show duplicate domains
        const duplicateList = document.getElementById('duplicateList');
        const duplicateUl = document.getElementById('duplicateDomainsUl');
        if (duplicates.length > 0) {
            duplicateUl.innerHTML = duplicates.map(domain => `<li>${domain}</li>`).join('');
            duplicateList.classList.remove('hidden');
        } else {
            duplicateList.classList.add('hidden');
        }
        
        document.getElementById('domainValidation').classList.remove('hidden');
        this.showToast(
            `Validasi selesai: ${valid.length} valid, ${invalid.length} invalid, ${duplicates.length} duplikat`,
            valid.length === this.domains.length ? 'success' : 'warning'
        );
    }

    clearDomains() {
        document.getElementById('domainList').value = '';
        this.domains = [];
        this.validDomains = [];
        document.getElementById('domainValidation').classList.add('hidden');
        this.saveData();
        this.updateUI();
        this.showToast('Daftar domain telah dihapus', 'info');
    }

    async testSshConnection() {
        if (!this.config.ssh.host || !this.config.ssh.username) {
            this.showToast('Harap isi host dan username SSH', 'error');
            return;
        }
        
        this.showLoading('Testing SSH connection...');
        
        try {
            const response = await fetch('/api/wordpress/test-ssh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    host: this.config.ssh.host,
                    port: this.config.ssh.port,
                    username: this.config.ssh.username,
                    password: this.config.ssh.password
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showToast('Koneksi SSH berhasil!', 'success');
            } else {
                this.showToast(`Koneksi SSH gagal: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error testing SSH: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async startChanging() {
        if (!this.isConfigurationValid() || this.validDomains.length === 0) {
            this.showToast('Konfigurasi tidak lengkap atau tidak ada domain valid', 'error');
            return;
        }
        
        this.isProcessing = true;
        this.results = [];
        this.updateUI();
        
        // Show monitor section
        document.getElementById('monitorSection').classList.remove('hidden');
        document.getElementById('resultsSection').classList.add('hidden');
        
        // Reset progress
        this.updateProgress(0, 0, 0, 0, 0, 'Memulai proses...');
        this.clearLogs();
        
        try {
            const response = await fetch('/api/wordpress/start-changing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ssh: this.config.ssh,
                    wordpress: this.config.wordpress,
                    domains: this.validDomains
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.processId = result.processId;
                this.showToast('Proses dimulai', 'success');
                this.startPolling();
            } else {
                throw new Error(result.error || 'Failed to start process');
            }
        } catch (error) {
            this.showToast(`Error memulai proses: ${error.message}`, 'error');
            this.isProcessing = false;
            this.updateUI();
        }
    }

    async stopChanging() {
        if (!this.processId) return;
        
        try {
            const response = await fetch(`/api/wordpress/stop/${this.processId}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showToast('Proses dihentikan', 'info');
            } else {
                this.showToast(`Error menghentikan proses: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error menghentikan proses: ${error.message}`, 'error');
        }
    }

    async startPolling() {
        const pollInterval = setInterval(async () => {
            if (!this.processId || !this.isProcessing) {
                clearInterval(pollInterval);
                return;
            }
            
            try {
                const response = await fetch(`/api/wordpress/status/${this.processId}`);
                const status = await response.json();
                
                if (response.ok && status.success) {
                    this.handleStatusUpdate(status.data);
                    
                    if (status.data.completed || status.data.error) {
                        clearInterval(pollInterval);
                        this.handleProcessCompletion(status.data);
                    }
                } else {
                    console.error('Polling error:', status.error);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000);
    }

    handleStatusUpdate(status) {
        const { processed, successful, failed, skipped, total, currentDomain, logs } = status;
        
        this.updateProgress(processed, successful, failed, skipped, total, 
            currentDomain ? `Memproses: ${currentDomain}` : 'Memproses...');
        
        // Add new logs
        if (logs && logs.length > 0) {
            logs.forEach(log => this.addLog(log.message, log.level, log.timestamp));
        }
        
        // Update results
        if (status.results) {
            this.results = status.results;
        }
    }

    handleProcessCompletion(status) {
        this.isProcessing = false;
        this.processId = null;
        this.updateUI();
        
        if (status.error) {
            this.showToast(`Proses selesai dengan error: ${status.error}`, 'error');
        } else {
            this.showToast(`Proses selesai: ${status.successful} berhasil, ${status.failed} gagal`, 'success');
        }
        
        // Show results
        this.displayResults();
    }

    updateProgress(processed, successful, failed, skipped, total, message) {
        const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
        
        document.getElementById('progressText').textContent = message;
        document.getElementById('progressPercentage').textContent = `${percentage}%`;
        document.getElementById('progressFill').style.width = `${percentage}%`;
        
        document.getElementById('processedCount').textContent = processed;
        document.getElementById('successCount').textContent = successful;
        document.getElementById('failedCount').textContent = failed;
        document.getElementById('skippedCount').textContent = skipped;
    }

    addLog(message, level = 'info', timestamp = new Date()) {
        const logsContent = document.getElementById('logsContent');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        
        const time = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const timeStr = time.toLocaleTimeString();
        
        logEntry.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-message">${message}</span>
        `;
        
        logsContent.appendChild(logEntry);
        
        // Auto scroll if enabled
        if (document.getElementById('autoScrollLogs').checked) {
            logsContent.scrollTop = logsContent.scrollHeight;
        }
    }

    clearLogs() {
        document.getElementById('logsContent').innerHTML = '';
    }

    displayResults() {
        if (this.results.length === 0) return;
        
        const successfulResults = this.results.filter(r => r.success);
        
        document.getElementById('successfulChangesCount').textContent = successfulResults.length;
        
        const resultsList = document.getElementById('resultsList');
        resultsList.innerHTML = this.results.map(result => `
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
                            <span class="detail-value password-field">${result.newWpPassword || 'N/A'}</span>
                        </div>
                        ${result.loginUrl ? `
                        <div class="detail-row">
                            <span class="detail-label">${result.hasMagicLink ? 'Magic Login Link:' : 'Login URL:'}</span>
                            <div class="login-link-container">
                                <a href="${result.loginUrl}" target="_blank" class="login-link magic-link">
                                    ${result.hasMagicLink ? '🔗 Auto Login' : '🔗 Login Page'}
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
        
        document.getElementById('resultsSection').classList.remove('hidden');
    }

    exportResults() {
        if (this.results.length === 0) {
            this.showToast('warning', 'No results to export');
            return;
        }
        
        const successfulResults = this.results.filter(r => r.success);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        let content = `WordPress Admin Change Results - ${new Date().toLocaleString()}\n`;
        content += `===============================================\n\n`;
        content += `Summary:\n`;
        content += `- Total domains: ${this.results.length}\n`;
        content += `- Successful: ${successfulResults.length}\n`;
        content += `- Failed: ${this.results.length - successfulResults.length}\n\n`;
        
        content += `Successful Changes:\n`;
        content += `==================\n`;
        successfulResults.forEach(result => {
            content += `Domain: ${result.domain}\n`;
            content += `cPanel User: ${result.cpanelUser}\n`;
            content += `WordPress Admin User: ${result.wpUser}\n`;
            content += `WordPress Admin Email: ${result.wpEmail || `admin@${result.domain}`}\n`;
            content += `New Password: ${result.newWpPassword}\n`;
            if (result.loginUrl) {
                content += `${result.hasMagicLink ? 'Magic Login Link' : 'Login URL'}: ${result.loginUrl}\n`;
            }
            content += `---\n`;
        });
        
        const failedResults = this.results.filter(r => !r.success);
        if (failedResults.length > 0) {
            content += `\nFailed Changes:\n`;
            content += `===============\n`;
            failedResults.forEach(result => {
                content += `Domain: ${result.domain}\n`;
                content += `Error: ${result.error}\n`;
                content += `---\n`;
            });
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wordpress-admin-changes-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('success', 'Results exported successfully');
    }

    saveData() {
        const data = {
            config: this.config,
            domains: this.domains,
            validDomains: this.validDomains
        };
        localStorage.setItem('wordpressAdminChangerData', JSON.stringify(data));
    }

    loadSavedData() {
        try {
            const saved = localStorage.getItem('wordpressAdminChangerData');
            if (saved) {
                const data = JSON.parse(saved);
                
                // Load config
                if (data.config) {
                    this.config = { ...this.config, ...data.config };
                    
                    // Populate form fields
                    document.getElementById('sshHost').value = this.config.ssh.host || '';
                    document.getElementById('sshPort').value = this.config.ssh.port || 22;
                    document.getElementById('sshUsername').value = this.config.ssh.username || '';
                    document.getElementById('sshPassword').value = this.config.ssh.password || '';
                    document.getElementById('newWpPassword').value = this.config.wordpress.newPassword || '';
                }
                
                // Load domains
                if (data.domains) {
                    this.domains = data.domains;
                    document.getElementById('domainList').value = this.domains.join('\n');
                }
                
                if (data.validDomains) {
                    this.validDomains = data.validDomains;
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    showLoading(text = 'Loading...') {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

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

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WordPressAdminChanger();
});