const { NodeSSH } = require('node-ssh');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

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
 * A helper function to generate a random email for the magic link.
 * @param {string} domain - The domain to base the email on.
 */
function generateRandomEmail(domain) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}@${domain}`;
}

/**
 * Executes cloning, WordPress password change, AdSense ID update, and magic link creation via SSH.
 * This function is a standalone and faithful equivalent of the logic in wordpress.js.
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

    let cpanelUser = null;
    let adminUsername = null;

    try {
        // --- Step 0: Get Source Instance ID for cloning ---
        const instanceIdCmd = `wp-toolkit --list -domain-name ${masterCloneDomain} -format json`;
        const instanceIdResult = await ssh.execCommand(instanceIdCmd);
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
        const cloneResultCmd = await ssh.execCommand(cloneCmd, { execOptions: { pty: true } });
        if (cloneResultCmd.code !== 0) {
            throw new Error(`Clone command failed. STDERR: ${cloneResultCmd.stderr || 'No stderr output'}.`);
        }
        const cloneResultJson = JSON.parse(cloneResultCmd.stdout.trim());
        const targetInstanceId = cloneResultJson?.targetInstanceId;
        if (!targetInstanceId) {
            throw new Error(`Could not get instance ID for target domain ${domain} from clone output.`);
        }

        // --- Step 2: Get cPanel username ---
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        if (cpanelUserResult.code !== 0 || !cpanelUserResult.stdout.trim()) {
            throw new Error(`Failed to get cPanel user for ${domain}. STDERR: ${cpanelUserResult.stderr || 'N/A'}`);
        }
        cpanelUser = cpanelUserResult.stdout.trim();
        const docRoot = `/home/${cpanelUser}/public_html`;

        // --- Step 3: Change WordPress Admin Password ---
        const wpUserCmd = `wp user list --path=${docRoot} --role=administrator --field=user_login --allow-root`;
        const wpUserResult = await ssh.execCommand(wpUserCmd);
        if (wpUserResult.code !== 0 || !wpUserResult.stdout.trim()) {
            throw new Error(`Failed to get WordPress admin user for ${domain}. STDERR: ${wpUserResult.stderr || 'N/A'}`);
        }
        adminUsername = wpUserResult.stdout.trim().split('\n')[0];
        
        const updatePasswordCmd = `wp user update ${adminUsername} --user_pass='${newPassword}' --path=${docRoot} --allow-root`;
        const updatePasswordResult = await ssh.execCommand(updatePasswordCmd);
        if (updatePasswordResult.code !== 0) {
            throw new Error(`Failed to update WP password for ${domain}. STDERR: ${updatePasswordResult.stderr || 'N/A'}`);
        }

        // --- Step 4: Update AdSense ID (only if provided) ---
        if (adsenseIdNumbers) {
            const headerPath = `/home/${cpanelUser}/public_html/wp-content/themes/superfast/header.php`;
            const checkFileCmd = `if [ -f "${headerPath}" ]; then echo "exists"; fi`;
            const fileCheckResult = await ssh.execCommand(checkFileCmd);
            if (fileCheckResult.stdout.trim() === "exists") {
                const escapedAdsenseId = adsenseIdNumbers.replace(/[&/\\$'"]/g, '\\$&');
                const oldAdsensePattern = "[0-9]\\{16\\}";
                const sedCmd = `sed -i.bak_sed "s#\\(<script async src=\\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\\)${oldAdsensePattern}\\(\\"\\)#\\1${escapedAdsenseId}\\2#g" "${headerPath}"`;
                const editResult = await ssh.execCommand(sedCmd);
                if (editResult.code !== 0) {
                    logger.warn(`(Non-fatal) Failed to edit AdSense ID in ${headerPath}. STDERR: ${editResult.stderr}`);
                }
            } else {
                logger.warn(`(Non-fatal) AdSense edit skipped for ${domain}: File not found at ${headerPath}`);
            }
        } else {
            logger.info(`AdSense ID not provided for ${domain}, skipping update.`);
        }

        // --- Step 5: Install Plugin Set and Create Magic Link ---
        let magicLink = `https://${domain}/wp-admin/`; // Fallback
        try {
            // Install the mandatory plugin set
            logger.info(`Installing plugin set 3 for instance ${targetInstanceId} on domain ${domain}...`);
            const installSetCmd = `wp-toolkit --sets -operation install -set-id 3 -instance-id ${targetInstanceId}`;
            const installSetResult = await ssh.execCommand(installSetCmd);
            if (installSetResult.code !== 0) {
                // Log as a warning and continue, as magic link might still work if plugin is already there
                logger.warn(`(Non-fatal) Failed to install plugin set 3 for instance ${targetInstanceId}. STDERR: ${installSetResult.stderr || 'N/A'}`);
            } else {
                logger.info(`Successfully installed plugin set 3 for instance ${targetInstanceId}.`);
            }

            // Activate the specific plugin needed for magic links
            logger.info(`Activating temporary-login-without-password plugin for ${domain}...`);
            const pluginSlug = 'temporary-login-without-password';
            const activateCmd = `wp plugin activate ${pluginSlug} --allow-root --path=${docRoot}`;
            const activateResult = await ssh.execCommand(activateCmd);
            if (activateResult.code !== 0) {
                // Log as a warning, as the magic link creation step will provide a more specific error if it fails.
                logger.warn(`(Non-fatal) Failed to activate ${pluginSlug} for ${domain}. It might already be active. STDERR: ${activateResult.stderr || 'N/A'}`);
            }

            // Create the magic link
            const randomEmail = generateRandomEmail(domain);
            const tlwpCreateCmd = `wp tlwp create --email=${randomEmail} --role=administrator --allow-root --path=${docRoot}`;
            const tlwpResult = await ssh.execCommand(tlwpCreateCmd);

            if (tlwpResult.code === 0 && tlwpResult.stdout.trim()) {
                const tlwpJson = JSON.parse(tlwpResult.stdout.trim());
                if (tlwpJson.status === 'success' && tlwpJson.login_url) {
                    magicLink = tlwpJson.login_url;
                }
            } else if (tlwpResult.stderr) {
                logger.warn(`(Non-fatal) Could not generate magic link for ${domain}. STDERR: ${tlwpResult.stderr}`);
            }
        } catch (magicLinkError) {
            logger.warn(`(Non-fatal) Magic link creation process failed for ${domain}: ${magicLinkError.message}`);
        }

        return { cpanelUser, adminUsername, magicLink };

    } finally {
        if (ssh.isConnected()) {
            await ssh.dispose();
        }
    }
}

/**
 * Creates or replaces the ads.txt file on a domain via SSH.
 * @param {object} sshConfig - { host, username, password }
 * @param {string} domain - The target domain.
 * @param {string} content - The content to write to the ads.txt file.
 */
async function createAdsTxtFile(sshConfig, domain, content) {
    const ssh = new NodeSSH();
    await ssh.connect({
        host: sshConfig.host,
        username: sshConfig.username,
        password: sshConfig.password,
        tryKeyboard: true,
    });

    try {
        // First, get the cPanel username to determine the document root
        const cpanelUserCmd = `whmapi1 listaccts | awk '/domain: ${domain}/{found=1} found && /user:/{print $2; exit}'`;
        const cpanelUserResult = await ssh.execCommand(cpanelUserCmd);
        if (cpanelUserResult.code !== 0 || !cpanelUserResult.stdout.trim()) {
            throw new Error(`Failed to get cPanel user for ${domain} to create ads.txt. STDERR: ${cpanelUserResult.stderr || 'N/A'}`);
        }
        const cpanelUser = cpanelUserResult.stdout.trim();
        const adsTxtPath = `/home/${cpanelUser}/public_html/ads.txt`;

        // Use a temporary local file to handle content with special characters
        const tempFilePath = path.join(__dirname, `temp_ads_${domain}.txt`);
        fs.writeFileSync(tempFilePath, content);

        // Upload the file
        await ssh.putFile(tempFilePath, adsTxtPath);

        // Clean up the temporary file
        fs.unlinkSync(tempFilePath);

    } catch (error) {
        throw new Error(`Failed to create ads.txt for ${domain}: ${error.message}`);
    } finally {
        if (ssh.isConnected()) {
            await ssh.dispose();
        }
    }
}

module.exports = {
    validateSshCredentials,
    runAllInOneSshTasks,
    createAdsTxtFile,
};
