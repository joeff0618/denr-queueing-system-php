<?php
declare(strict_types=1);

// Bootstraps configuration, error reporting, session, and DB/Helpers
require_once __DIR__ . '/core/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_GET['path'] ?? trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
$path = preg_replace('#^api/#', '', (string) $path);
$parts = array_values(array_filter(explode('/', $path), 'strlen'));

try {
    $pdo = db();
    $module = $parts[0] ?? '';

    if ($module === 'ws') {
        fail(404, 'WebSockets are not available on shared PHP hosting.');
    }

    if ($module === 'auth') {
        require_once __DIR__ . '/routes/auth.php';
        exit;
    }

    if ($module === 'queue') {
        require_once __DIR__ . '/routes/queue.php';
        exit;
    }

    if ($module === 'divisions') {
        require_once __DIR__ . '/routes/divisions.php';
        exit;
    }

    fail(404, 'Endpoint not found');
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}
