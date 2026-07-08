# DENR Queueing System — Local Development & Deployment Guide

This is the PHP/MySQL version of the DENR Queueing System, optimized for both local development and Hostinger/shared hosting environments.

---

## 1. Local Database Setup

1. Make sure **MySQL Server** is running locally (default port `3306`).
2. Create a database named `queue_db` in your local database manager or terminal:
   ```sql
   CREATE DATABASE queue_db;
   ```
3. Import the initial schema and default seed data from `queueing.sql`:
   ```bash
   mysql -u root -p queue_db < queueing.sql
   ```
4. Verify/configure your local database credentials in `backend/config.php`:
   ```php
   return [
       'db_host' => '127.0.0.1',
       'db_name' => 'queue_db',
       'db_user' => 'root',
       'db_pass' => 'your_password', // Put your MySQL password here
       ...
   ];
   ```

---

## 2. Starting the Local Server

You can run the application locally using PHP's built-in web server. A custom `router.php` router script is included to handle API routing and rewrite rules locally.

### Option A: Local-Only Mode (Testing on the same machine)
To run the server listening only to requests originating from your computer:
```bash
php -S localhost:8001 router.php
```
Open your browser and navigate to:
* **Client Kiosk**: `http://localhost:8001/client/index.html`
* **TV Display**: `http://localhost:8001/tv/index.html`
* **Operator Panel**: `http://localhost:8001/login/auth.html`
* **Monitoring Panel**: `http://localhost:8001/login/auth.html`

---

### Option B: LAN Mode (Testing on Mobile/Other Devices on the same Wi-Fi)
To access and test the queue system on external devices (like smartphones, tablets, or separate laptops) connected to the same Wi-Fi network:

1. Find your host computer's local IP address (e.g. `10.100.42.128` or `192.168.1.X`).
2. Start the PHP server bound to all interfaces (`0.0.0.0`):
   ```bash
   php -S 0.0.0.0:8001 router.php
   ```
3. Open a browser on any device connected to the same local network and enter:
   * **Client Kiosk**: `http://<your-local-ip>:8001/client/index.html`
   * **TV Display**: `http://<your-local-ip>:8001/tv/index.html`
   * **Operator Panel**: `http://<your-local-ip>:8001/login/auth.html`

---

## 3. Deployment Note (Hostinger/Apache)
When deploying to shared Apache servers (like Hostinger):
1. Import `queueing.sql` using phpMyAdmin.
2. Edit `backend/config.php` to use your production credentials.
3. Upload all files (including `.htaccess`) directly to your web root (`public_html`). The `.htaccess` file handles the rewrite rules in production. (Do not upload `router.php` or `prompts.txt` to production).
