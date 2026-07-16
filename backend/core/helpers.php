<?php
declare(strict_types=1);

/**
 * Decodes the raw JSON request body into an associative array.
 * 
 * @return array Decoded JSON data or empty array if invalid/empty.
 */
function json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Sends a JSON response with the given status code and exits execution.
 * 
 * @param mixed $data Response payload.
 * @param int $status HTTP status code.
 * @return void
 */
function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Responds with a standard error detail layout and exits.
 * 
 * @param int $status HTTP status code.
 * @param string $detail Error message.
 * @return void
 */
function fail(int $status, string $detail): void
{
    respond(['detail' => $detail], $status);
}

/**
 * Asserts the user is logged in, returning their user ID.
 * Exits with a 401 response code if not authenticated.
 * 
 * @return int Authenticated user ID.
 */
function require_login(): int
{
    if (empty($_SESSION['user_id'])) {
        fail(401, 'Not authenticated');
    }
    return (int) $_SESSION['user_id'];
}

/**
 * Asserts that the authenticated user is a super admin (sadmin).
 * Exits with a 403 response code if the user is not a super admin.
 * 
 * @param PDO $pdo PDO database connection.
 * @return int Super admin user ID.
 */
function require_sadmin(PDO $pdo): int
{
    $userId = require_login();
    if (empty($_SESSION['division']) || strtolower($_SESSION['division']) !== 'sadmin') {
        fail(403, 'Forbidden: Administrative privileges required');
    }
    return $userId;
}

/**
 * Fetches all users from the database, calculating their active online/offline status based on activity.
 * 
 * @param PDO $pdo PDO database connection.
 * @return array List of user database rows.
 */
function get_users(PDO $pdo): array
{
    $stmt = $pdo->query("SELECT *, CASE WHEN last_seen >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
                THEN 'online' ELSE 'offline' END AS status FROM queueing_users ORDER BY name");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
