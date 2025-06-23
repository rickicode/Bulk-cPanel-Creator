const { NodeSSH } = require('node-ssh');
const logger = require('../utils/logger');

/**
 * Validates SSH credentials by attempting a connection.
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
        await ssh.dispose();
    } catch (error) {
        throw new Error(`SSH connection failed: ${error.message}`);
    }
}

/**
 * Executes cloning, WordPress password change, and AdSense ID update via SSH.
 * This function is a standalone equivalent of the logic in wordpress.js.
 * @param {object} sshConfig - { host, username, password }
 * @param {string} domain - The target domain to operate on.
 * @param {string} newPassword - The new WordPress admin password.
 * @param {string} adsenseIdNumbers - The numeric part of the AdSense ID.
 * @param {string} masterCloneDomain - The source domain for cloning.
 */
async function runAllInOneSshTasks(sshConfig, domain, newPassword, adsenseIdNumbers, masterCloneDomain) {
    const ssh = new NodeSSH();
    await ssh.connect({
        host: sshConfig.host,
        username: sshConfig.username,
        password: sshConfig.password,
        tryKeyboard: true,
    });

    try {
        // --- Step 0: Get Source Instance ID for cloning ---
        let sourceInstanceId;
        try {
            const instanceIdCmd = `wp-toolkit --list -domain-name ${masterCloneDomain} -format json`;
            const instanceIdResult = await ssh.execCommand(instanceIdCmd);
            if (instanceIdResult.code !== 0 || !instanceIdResult.stdout) {
                throw new Error(`Failed to get instance ID for master domain. STDERR: ${instanceIdResult.stderr || 'N/A'}`);
            }
            const instances = JSON.parse(instanceIdResult.stdout.trim());
            if (instances && instances.length > 0 && instances[0].id) {
                sourceInstanceId = instances[0].id;
            } else {
                throw new Error('Instance ID not found in wp-toolkit response for master domain.');
            }
        } catch (error) {
            throw new Error(`Failed to get sourceInstanceId for ${masterCloneDomain}: ${error.message}`);
        }

        // --- Step 1: Clone WordPress site using wp-toolkit ---
        const cloneCmd = `wp-toolkit --clone -source-instance-id ${sourceInstanceId} -target-domain-name ${domain} -force-overwrite yes -format json`;
        const cloneResultCmd = await ssh.execCommand(cloneCmd, { execOptions: { pty: true } });
        if (cloneResultCmd.code !== 0) {
            throw new Error(`Clone command failed. STDERR: ${cloneResultCmd.stderr || 'No stderr output'}.`);
        }

        // --- Step 2: Get cPanel username for the newly created/cloned domain ---
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        if (cpanelUserResult.code !== 0 || !cpanelUserResult.stdout.trim()) {
            throw new Error(`Failed to get cPanel user for ${domain}. STDERR: ${cpanelUserResult.stderr || 'N/A'}`);
        }
        const cpanelUser = cpanelUserResult.stdout.trim();
        const docRoot = `/home/${cpanelUser}/public_html`;

        // --- Step 3: Change WordPress Admin Password ---
        const wpUserCmd = `wp user list --path=${docRoot} --role=administrator --field=user_login --allow-root`;
        const wpUserResult = await ssh.execCommand(wpUserCmd);
        if (wpUserResult.code !== 0 || !wpUserResult.stdout.trim()) {
            throw new Error(`Failed to get WordPress admin user for ${domain}. STDERR: ${wpUserResult.stderr || 'N/A'}`);
        }
        const adminUsername = wpUserResult.stdout.trim().split('\n')[0];
        
        const updatePasswordCmd = `wp user update ${adminUsername} --user_pass='${newPassword}' --path=${docRoot} --allow-root`;
        const updatePasswordResult = await ssh.execCommand(updatePasswordCmd);
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WP password for ${domain}. STDERR: ${updatePasswordResult.stderr || 'N/A'}`);
        }

        // --- Step 4: Update AdSense ID ---
        const fullAdsenseId = `pub-${adsenseIdNumbers}`;
        const headerPath = `/home/${cpanelUser}/public_html/wp-content/themes/superfast/header.php`;

        const checkFileCmd = `if [ -f "${headerPath}" ]; then echo "exists"; fi`;
        const fileCheckResult = await ssh.execCommand(checkFileCmd);
        if (fileCheckResult.stdout.trim() !== "exists") {
            // This is not a fatal error, just a warning.
            logger.warn(`AdSense edit skipped: File not found at ${headerPath}`);
        } else {
            const sedCmd = `sed -i.bak "s/pub-[0-9]\{16\}/${fullAdsenseId}/g" "${headerPath}"`;
            const editResult = await ssh.execCommand(sedCmd);
            if (editResult.code !== 0) {
                // Also not a fatal error, just log it.
                logger.warn(`Failed to edit ${headerPath} with sed. STDERR: ${editResult.stderr}`);
            }
        }

        // Return the cpanelUser and adminUsername so they can be used in the results log
        return { cpanelUser, adminUsername };

    } finally {
        if (ssh.isConnected()) {
            await ssh.dispose();
        }
    }
}

module.exports = {
    validateSshCredentials,
    runAllInOneSshTasks,
};
