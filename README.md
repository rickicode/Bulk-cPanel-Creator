# cPanel Bulk Creator & WordPress Management Suite

This application is a powerful and comprehensive tool designed for web hosting administrators and developers to automate and streamline the management of cPanel accounts and WordPress installations. It provides a user-friendly web interface to perform complex bulk operations that would otherwise be time-consuming and error-prone.

The suite is built on a robust backend using Node.js and Express, coupled with a responsive and intuitive frontend. All long-running tasks are handled asynchronously, allowing users to monitor progress in real-time without tying up their browser.

## Core Features

The application is divided into three main functional modules, accessible from the main interface:

### 1. cPanel Bulk Account Creator

This is the primary feature of the application. It allows for the creation of multiple cPanel accounts in a single batch process.

**How it Works:**

1.  **Configuration**: The user provides WHM server credentials (host, username, and password or API token) and optional Cloudflare API credentials. The application tests these credentials to ensure validity before proceeding.
2.  **Domain Input**: A list of domains is provided, one per line. The application validates this list to check for invalid formats and duplicates.
3.  **Process Initiation**: The user starts the creation process. The backend receives the request, generates a unique process ID, and immediately returns it to the frontend.
4.  **Asynchronous Processing**: The backend processes the domains in batches to avoid overwhelming the WHM server. For each domain:
    *   **(Optional) Cloudflare DNS**: If configured, it first creates an 'A' or 'CNAME' record in Cloudflare. If this step fails, the cPanel account creation for that domain is skipped.
    *   **cPanel Account Creation**: It generates a unique username and a secure password, then calls the WHM API to create the cPanel account.
5.  **Real-time Monitoring**: The frontend uses the process ID to poll the server for status updates and logs, displaying progress, statistics (successful, failed, skipped), and detailed logs in real-time.
6.  **Results**: Upon completion, detailed results are displayed, separating successful creations (with full login details), skipped domains (e.g., already exist), and failed creations. All results can be exported to TXT or CSV files.

### 2. cPanel Bulk Account Deleter

This module provides the functionality to terminate multiple cPanel accounts in bulk, a critical task for server cleanup and management.

**How it Works:**

1.  **Configuration**: The user provides WHM credentials and, optionally, Cloudflare credentials for DNS cleanup.
2.  **Domain Input**: A list of domains corresponding to the cPanel accounts to be deleted is provided.
3.  **Asynchronous Deletion**: Similar to the creation process, deletion is handled asynchronously. For each domain:
    *   The backend first identifies the cPanel username associated with the domain.
    *   It then calls the WHM API to terminate the account.
    *   **(Optional) Cloudflare DNS Cleanup**: If configured, it then removes all DNS records associated with that domain from Cloudflare.
4.  **Monitoring and Results**: The process can be monitored in real-time, and a full report of deleted and failed accounts is provided upon completion.

### 3. WordPress Bulk Admin Changer & Cloner

This is a highly advanced feature for managing multiple WordPress sites from a single interface via SSH.

**How it Works:**

1.  **SSH Configuration**: The user provides SSH credentials for the server where the WordPress sites are hosted.
2.  **Operation Selection**: The user inputs a list of domains and selects the operations to perform:
    *   **Change Admin Password**: Updates the password for the primary administrator account.
    *   **Generate Magic Login Link**: Creates a temporary, one-click login link for easy access.
    *   **Update Google AdSense ID**: Automatically finds and replaces the Google AdSense publisher ID in the theme's `header.php` file.
    *   **Clone WordPress Site**: Clones a master WordPress installation (including files and database) to all target domains using the `wp-toolkit` command-line utility.
3.  **Asynchronous Execution**: All operations are performed over a single, persistent SSH connection for efficiency. The backend iterates through each domain, executing the selected `wp-cli` and other shell commands.
4.  **Monitoring and Results**: The entire process is monitored in real-time, with detailed logs for each command executed on each domain. Final results provide a clear summary of the outcome for each site.

## Technical Stack

*   **Backend**: Node.js, Express.js
*   **Frontend**: Vanilla JavaScript (ES6 Class-based), HTML5, CSS3
*   **Key Libraries**:
    *   `helmet`: For securing the Express app with various HTTP headers.
    *   `cors`: For Cross-Origin Resource Sharing.
    *   `node-ssh`: For handling SSH connections in the WordPress module.
    *   `uuid`: For generating unique process IDs.
*   **Communication Protocol**: REST API with a polling mechanism for asynchronous task updates.

## How to Use

1.  **Setup**: Clone the repository, install dependencies using `npm install`, and create a `.env` file from the `.env.example` template with your specific configurations.
2.  **Launch**: Start the server using `npm start`.
3.  **Access**: Open your web browser and navigate to the provided URL (e.g., `http://localhost:3000`).
4.  **Operate**:
    *   Select the desired tool (Bulk Creator, Bulk Deleter, or WordPress Changer).
    *   Fill in the required credentials and configurations.
    *   Input your list of domains.
    *   Validate the data and start the process.
    *   Monitor the progress and export the results once completed.
