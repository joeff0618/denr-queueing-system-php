# DENR Queueing System - PHP Version

This is the PHP/MySQL version for Hostinger shared hosting and FileZilla upload.
It does not require Python, FastAPI, Uvicorn, Passenger, SSH, or cPanel terminal access.

## Folder Structure

```text
backend/       PHP backend API
frontend/      Static HTML, CSS, JS, images, and sounds
.htaccess      Apache routes for /api and frontend pages
index.php      Redirects visitors to the login page
queueing.sql   MySQL schema and seed data
```

## Upload To Hostinger

Upload all files and folders in this package to your domain's `public_html`.
Make sure `.htaccess` is uploaded too. In FileZilla, enable hidden files if needed.

## Database Setup

1. Create a MySQL database and user in Hostinger hPanel.
2. Import `queueing.sql` using phpMyAdmin.
3. Edit `backend/config.php`:

```php
'db_host' => 'localhost',
'db_name' => 'your_hostinger_database_name',
'db_user' => 'your_hostinger_database_user',
'db_pass' => 'your_hostinger_database_password',
```

Hostinger database names often look like `u123456789_queueing`.

## Pages

- Login: `https://your-domain.com/login/auth.html`
- Client page: `https://your-domain.com/client/index.html`
- Operator page: `https://your-domain.com/operator/index.html`
- Monitoring page: `https://your-domain.com/monitoring/index.html`
- TV display: `https://your-domain.com/tv/index.html`
- API test: `https://your-domain.com/api/queue/test`

## Default Accounts

The seed users in `queueing.sql` use password `1234`.

- `operator@email.com`
- `sadmin@email.com`
- `smd@email.com`
- `lpdd@email.com`

## Shared Hosting Note

Normal Hostinger shared hosting does not run WebSocket servers. This PHP version uses regular API requests and polling so the queue screens still update on shared hosting.
