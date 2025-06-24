const { NodeSSH } = require('node-ssh');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Validates SSH credentials by attempting a connection.
 * This remains a standalone function for pre-process validation.
 * @param {object} sshConfig - { host, username, password }
 */
async function validateSshCredentials(sshConfig) {
    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: sshConfig.host,
            username: sshConfig.username,
            password: sshConfig.password,
            tryKeyboard: true,
        });
    } catch (error) {
        throw new Error(`SSH connection failed: ${error.message}`);
    } finally {
        if (ssh.isConnected()) {
            await ssh.dispose();
        }
    }
}

/**
 * A helper function to generate a random email for the magic link.
 * @param {string} domain - The domain to base the email on.
 */
function generateRandomEmail(domain) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}@${domain}`;
}

/**
 * Manages a persistent SSH connection for all operations on a single domain.
 */
class SshSession {
    constructor(sshConfig) {
        this.ssh = new NodeSSH();
        this.config = sshConfig;
        this.cpanelUser = null; // Store cpanelUser once fetched
    }

    async connect() {
        if (!this.ssh.isConnected()) {
            await this.ssh.connect({
                host: this.config.host,
                username: this.config.username,
                password: this.config.password,
                tryKeyboard: true,
            });
        }
    }

    async dispose() {
        if (this.ssh.isConnected()) {
            await this.ssh.dispose();
        }
    }

    /**
     * Gets and caches the cPanel username for the domain.
     * @param {string} domain - The target domain.
     */
    async getCpanelUser(domain) {
        if (this.cpanelUser) {
            return this.cpanelUser;
        }
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const result = await this.ssh.execCommand(cpanelUserCmd);
        if (result.code !== 0 || !result.stdout.trim()) {
            throw new Error(`Failed to get cPanel user for ${domain}. STDERR: ${result.stderr || 'N/A'}`);
        }
        this.cpanelUser = result.stdout.trim();
        return this.cpanelUser;
    }

    /**
     * Executes cloning, WordPress password change, AdSense ID update, and magic link creation.
     */
    async runAllInOneSshTasks(domain, newPassword, adsenseIdNumbers, masterCloneDomain) {
        let adminUsername = null;

        // --- Step 0: Get Source Instance ID for cloning ---
        const instanceIdCmd = `wp-toolkit --list -domain-name ${masterCloneDomain} -format json`;
        const instanceIdResult = await this.ssh.execCommand(instanceIdCmd);
        if (instanceIdResult.code !== 0 || !instanceIdResult.stdout) {
            throw new Error(`Failed to get instance ID for master domain. STDERR: ${instanceIdResult.stderr || 'N/A'}`);
        }
        const instances = JSON.parse(instanceIdResult.stdout.trim());
        const sourceInstanceId = instances?.[0]?.id;
        if (!sourceInstanceId) {
            throw new Error('Instance ID not found in wp-toolkit response for master domain.');
        }

        // --- Step 1: Clone WordPress site ---
        const cloneCmd = `wp-toolkit --clone -source-instance-id ${sourceInstanceId} -target-domain-name ${domain} -force-overwrite yes -format json`;
        const cloneResultCmd = await this.ssh.execCommand(cloneCmd, { execOptions: { pty: true } });
        if (cloneResultCmd.code !== 0) {
            throw new Error(`Clone command failed. STDOUT: ${cloneResultCmd.stdout || 'N/A'}. STDERR: ${cloneResultCmd.stderr || 'N/A'}.`);
        }
        const cloneResultJson = JSON.parse(cloneResultCmd.stdout.trim());
        const targetInstanceId = cloneResultJson?.targetInstanceId;
        if (!targetInstanceId) {
            throw new Error(`Could not get instance ID for target domain ${domain} from clone output.`);
        }

        // --- Step 2: Get cPanel username (and cache it) ---
        const cpanelUser = await this.getCpanelUser(domain);
        const docRoot = `/home/${cpanelUser}/public_html`;

        // --- Step 3: Change WordPress Admin Password ---
        const wpUserCmd = `wp user list --path=${docRoot} --role=administrator --field=user_login --allow-root`;
        const wpUserResult = await this.ssh.execCommand(wpUserCmd);
        if (wpUserResult.code !== 0 || !wpUserResult.stdout.trim()) {
            throw new Error(`Failed to get WordPress admin user for ${domain}. STDERR: ${wpUserResult.stderr || 'N/A'}`);
        }
        adminUsername = wpUserResult.stdout.trim().split('\n')[0];
        
        const updatePasswordCmd = `wp user update ${adminUsername} --user_pass='${newPassword}' --path=${docRoot} --allow-root`;
        const updatePasswordResult = await this.ssh.execCommand(updatePasswordCmd);
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WP password for ${domain}. STDERR: ${updatePasswordResult.stderr || 'N/A'}`);
        }

        // --- Step 4: Update AdSense ID (only if provided) ---
        if (adsenseIdNumbers) {
            const headerPath = `/home/${cpanelUser}/public_html/wp-content/themes/superfast/header.php`;
            const checkFileCmd = `if [ -f "${headerPath}" ]; then echo "exists"; fi`;
            const fileCheckResult = await this.ssh.execCommand(checkFileCmd);
            if (fileCheckResult.stdout.trim() === "exists") {
                const escapedAdsenseId = adsenseIdNumbers.replace(/[&/\\$'"]/g, '\\$&');
                const oldAdsensePattern = "[0-9]\\{16\\}";
                const sedCmd = `sed -i.bak_sed "s#\\(<script async src=\\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\\)${oldAdsensePattern}\\(\\"\\)#\\1${escapedAdsenseId}\\2#g" "${headerPath}"`;
                const editResult = await this.ssh.execCommand(sedCmd);
                if (editResult.code !== 0) {
                    logger.warn(`(Non-fatal) Failed to edit AdSense ID in ${headerPath}. STDERR: ${editResult.stderr}`);
                }
            } else {
                logger.warn(`(Non-fatal) AdSense edit skipped for ${domain}: File not found at ${headerPath}`);
            }
        }

        // --- Step 5: Install Plugin Set and Create Magic Link ---
        let magicLink = `https://${domain}/wp-admin/`; // Fallback
        try {
            logger.info(`Installing plugin set 3 for instance ${targetInstanceId} on domain ${domain}...`);
            const installSetCmd = `wp-toolkit --sets -operation install -set-id 3 -instance-id ${targetInstanceId}`;
            await this.ssh.execCommand(installSetCmd);

            logger.info(`Activating temporary-login-without-password plugin for ${domain}...`);
            const activateCmd = `wp plugin activate temporary-login-without-password --allow-root --path=${docRoot}`;
            await this.ssh.execCommand(activateCmd);

            const randomEmail = generateRandomEmail(domain);
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=${docRoot}`;
            const tlwpResult = await this.ssh.execCommand(tlwpCreateCmd);

            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                const tlwpJson = JSON.parse(tlwpResult.stdout.trim());
                if (tlwpJson.status === 'success' && tlwpJson.login_url) {
                    magicLink = tlwpJson.login_url;
                }
            }
        } catch (magicLinkError) {
            logger.warn(`(Non-fatal) Magic link creation process failed for ${domain}: ${magicLinkError.message}`);
        }

        return { cpanelUser, adminUsername, magicLink };
    }

    /**
     * Executes tasks on an existing WordPress site without cloning.
     */
    async runSshTasksWithoutCloning(domain, newPassword, adsenseIdNumbers) {
        let adminUsername = null;

        // --- Step 1: Get cPanel username (and cache it) ---
        const cpanelUser = await this.getCpanelUser(domain);
        const docRoot = `/home/${cpanelUser}/public_html`;

        // --- Step 2: Get instance ID for plugin installation ---
        const instanceIdCmd = `wp-toolkit --list -domain-name ${domain} -format json`;
        const instanceIdResult = await this.ssh.execCommand(instanceIdCmd);
        const instances = JSON.parse(instanceIdResult.stdout.trim() || '[]');
        const targetInstanceId = instances?.[0]?.id;

        // --- Step 3: Change WordPress Admin Password ---
        const wpUserCmd = `wp user list --path=${docRoot} --role=administrator --field=user_login --allow-root`;
        const wpUserResult = await this.ssh.execCommand(wpUserCmd);
        if (wpUserResult.code !== 0 || !wpUserResult.stdout.trim()) {
            throw new Error(`Failed to get WordPress admin user for ${domain}. STDERR: ${wpUserResult.stderr || 'N/A'}`);
        }
        adminUsername = wpUserResult.stdout.trim().split('\n')[0];
        
        const updatePasswordCmd = `wp user update ${adminUsername} --user_pass='${newPassword}' --path=${docRoot} --allow-root`;
        await this.ssh.execCommand(updatePasswordCmd);

        // --- Step 4: Update AdSense ID (only if provided) ---
        if (adsenseIdNumbers) {
            const headerPath = `/home/${cpanelUser}/public_html/wp-content/themes/superfast/header.php`;
            const checkFileCmd = `if [ -f "${headerPath}" ]; then echo "exists"; fi`;
            const fileCheckResult = await this.ssh.execCommand(checkFileCmd);
            if (fileCheckResult.stdout.trim() === "exists") {
                const escapedAdsenseId = adsenseIdNumbers.replace(/[&/\\$'"]/g, '\\$&');
                const oldAdsensePattern = "[0-9]\\{16\\}";
                const sedCmd = `sed -i.bak_sed "s#\\(<script async src=\\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\\)${oldAdsensePattern}\\(\\"\\)#\\1${escapedAdsenseId}\\2#g" "${headerPath}"`;
                await this.ssh.execCommand(sedCmd);
            }
        }

        // --- Step 5: Install Plugin Set and Create Magic Link ---
        let magicLink = `https://${domain}/wp-admin/`; // Fallback
        try {
            if (targetInstanceId) {
                logger.info(`Installing plugin set 3 for instance ${targetInstanceId}...`);
                const installSetCmd = `wp-toolkit --sets -operation install -set-id 3 -instance-id ${targetInstanceId}`;
                await this.ssh.execCommand(installSetCmd);
            }
            
            logger.info(`Activating temporary-login-without-password plugin for ${domain}...`);
            const activateCmd = `wp plugin activate temporary-login-without-password --allow-root --path=${docRoot}`;
            await this.ssh.execCommand(activateCmd);

            const randomEmail = generateRandomEmail(domain);
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=${docRoot}`;
            const tlwpResult = await this.ssh.execCommand(tlwpCreateCmd);

            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                const tlwpJson = JSON.parse(tlwpResult.stdout.trim());
                if (tlwpJson.status === 'success' && tlwpJson.login_url) {
                    magicLink = tlwpJson.login_url;
                }
            }
        } catch (magicLinkError) {
            logger.warn(`(Non-fatal) Magic link creation process failed for ${domain}: ${magicLinkError.message}`);
        }

        return { cpanelUser, adminUsername, magicLink };
    }

    /**
     * Creates or replaces the ads.txt file on a domain.
     */
    async createAdsTxtFile(domain, content) {
        const cpanelUser = await this.getCpanelUser(domain);
        const adsTxtPath = `/home/${cpanelUser}/public_html/ads.txt`;

        const tempFilePath = path.join(__dirname, `temp_ads_${Date.now()}.txt`);
        fs.writeFileSync(tempFilePath, content);

        try {
            await this.ssh.putFile(tempFilePath, adsTxtPath);
        } finally {
            fs.unlinkSync(tempFilePath);
        }
    }
}

module.exports = {
    validateSshCredentials,
    SshSession,
};
