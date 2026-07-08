<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

$config = require dirname(__DIR__) . '/config.php';
date_default_timezone_set($config['timezone'] ?? 'Asia/Manila');

session_set_cookie_params([
    'lifetime' => 28800,
    'path' => '/',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
             || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');

// Load database connection helper
require_once __DIR__ . '/database.php';

// Load utility helper functions
require_once __DIR__ . '/helpers.php';

// Load data normalizing functions
require_once __DIR__ . '/normalizers.php';

// Load models
require_once dirname(__DIR__) . '/models/User.php';
require_once dirname(__DIR__) . '/models/QueueItem.php';
