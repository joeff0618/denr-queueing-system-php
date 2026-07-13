<?php
declare(strict_types=1);

function json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $detail): void
{
    respond(['detail' => $detail], $status);
}

function require_login(): int
{
    if (empty($_SESSION['user_id'])) {
        fail(401, 'Not authenticated');
    }
    return (int) $_SESSION['user_id'];
}

function require_sadmin(PDO $pdo): int
{
    $userId = require_login();
    if (empty($_SESSION['division']) || strtolower($_SESSION['division']) !== 'sadmin') {
        fail(403, 'Forbidden: Administrative privileges required');
    }
    return $userId;
}

function get_users(PDO $pdo): array
{
    $stmt = $pdo->query("SELECT *, CASE WHEN last_seen >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
                THEN 'online' ELSE 'offline' END AS status FROM queueing_users ORDER BY name");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
