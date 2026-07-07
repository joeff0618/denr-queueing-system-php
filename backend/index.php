<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone'] ?? 'Asia/Manila');

session_set_cookie_params([
    'lifetime' => 28800,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');

function db(): PDO
{
    static $pdo = null;
    global $config;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

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

function normalize_status(?string $status): string
{
    return strtolower((string) $status);
}

function normalize_division(?string $division): string
{
    return strtolower((string) $division);
}

function normalize_item(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'queue_no' => isset($row['queue_no']) ? (int) $row['queue_no'] : null,
        'client_name' => $row['client_name'],
        'purpose' => $row['purpose'],
        'status' => normalize_status($row['status']),
        'division' => normalize_division($row['division']),
        'priority' => strtolower((string) $row['priority']),
        'created_at' => $row['created_at'],
        'completed_at' => $row['completed_at'],
        'skip_count' => (int) ($row['skip_count'] ?? 0),
    ];
}

function normalize_user(array $row, string $status = 'offline'): array
{
    return [
        'id' => (int) $row['id'],
        'email' => $row['email'],
        'name' => $row['name'],
        'division' => normalize_division($row['division']),
        'created_at' => $row['created_at'],
        'last_seen' => $row['last_seen'],
        'status' => $status,
    ];
}

function priority_score(array $item): float
{
    global $config;
    $weights = $config['priority_weights'] ?? ['regular' => 50, 'pwd' => 100, 'senior' => 80, 'mother' => 70];
    $agingRate = (float) ($config['aging_rate'] ?? 4.0);

    $priority = strtolower((string) $item['priority']);
    $base = $weights[$priority] ?? 50;
    $created = strtotime((string) $item['created_at']);
    $minutes = max((time() - ($created ?: time())) / 60, 0);
    return $base + ($minutes * $agingRate);
}

function item_with_score(array $row): array
{
    $item = normalize_item($row);
    if ($item['status'] === 'pending') {
        $item['effective_priority'] = round(priority_score($item), 1);
    }
    return $item;
}

function today_bounds(): array
{
    return [date('Y-m-d 00:00:00'), date('Y-m-d 23:59:59')];
}

function reset_past_cards(PDO $pdo): void
{
    $today = date('Y-m-d 00:00:00');
    $stmt = $pdo->prepare(
        "UPDATE queueing_queue_items
         SET queue_no = NULL
         WHERE LOWER(status) IN ('pending', 'processing')
           AND created_at < ?
           AND queue_no IS NOT NULL"
    );
    $stmt->execute([$today]);
}

function get_item(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM queueing_queue_items WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function update_status(PDO $pdo, int $id, string $status): ?array
{
    $current = get_item($pdo, $id);
    if (!$current) {
        return null;
    }

    $status = strtolower($status);
    $completedAt = in_array($status, ['completed', 'cancelled'], true) ? date('Y-m-d H:i:s.u') : null;
    $createdAt = $current['created_at'];
    $skipCount = (int) ($current['skip_count'] ?? 0);

    if ($status === 'pending' && normalize_status($current['status']) === 'processing') {
        $createdAt = date('Y-m-d H:i:s.u');
        $skipCount++;
    }
    if ($status === 'processing') {
        $skipCount = 0;
    }

    $stmt = $pdo->prepare(
        'UPDATE queueing_queue_items
         SET status = ?, completed_at = ?, created_at = ?, skip_count = ?
         WHERE id = ?'
    );
    $stmt->execute([$status, $completedAt, $createdAt, $skipCount, $id]);
    return get_item($pdo, $id);
}

function call_next(PDO $pdo, array $excludeIds = []): ?array
{
    [$start, $end] = today_bounds();
    $params = [$start, $end];
    $excludeSql = '';
    if ($excludeIds) {
        $excludeSql = ' AND id NOT IN (' . implode(',', array_fill(0, count($excludeIds), '?')) . ')';
        $params = array_merge($params, $excludeIds);
    }

    $stmt = $pdo->prepare(
        "SELECT * FROM queueing_queue_items
         WHERE LOWER(status) = 'pending'
           AND created_at BETWEEN ? AND ?
           $excludeSql"
    );
    $stmt->execute($params);
    $items = $stmt->fetchAll();
    if (!$items) {
        return null;
    }

    usort($items, function (array $a, array $b): int {
        $score = priority_score($b) <=> priority_score($a);
        return $score !== 0 ? $score : strcmp((string) $a['created_at'], (string) $b['created_at']);
    });

    return update_status($pdo, (int) $items[0]['id'], 'processing');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_GET['path'] ?? trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
$path = preg_replace('#^api/#', '', (string) $path);
$parts = array_values(array_filter(explode('/', $path), 'strlen'));

try {
    $pdo = db();
    if (($parts[0] ?? '') === 'ws') {
        fail(404, 'WebSockets are not available on shared PHP hosting.');
    }

    if (($parts[0] ?? '') === 'auth') {
        $action = $parts[1] ?? '';
        if ($method === 'POST' && $action === 'login') {
            $body = json_body();
            $stmt = $pdo->prepare('SELECT * FROM queueing_users WHERE email = ? LIMIT 1');
            $stmt->execute([$body['email'] ?? '']);
            $user = $stmt->fetch();
            if (!$user || !password_verify((string) ($body['password'] ?? ''), (string) $user['password'])) {
                fail(401, 'Incorrect email or password');
            }
            $_SESSION['user_id'] = (int) $user['id'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['name'] = $user['name'];
            $_SESSION['division'] = normalize_division($user['division']);
            $pdo->prepare('UPDATE queueing_users SET last_seen = ? WHERE id = ?')->execute([date('Y-m-d H:i:s.u'), $user['id']]);
            respond(['message' => 'Login successful', 'user' => normalize_user($user, 'online')]);
        }

        if ($method === 'GET' && $action === 'profile') {
            $userId = require_login();
            $stmt = $pdo->prepare('SELECT * FROM queueing_users WHERE id = ?');
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            if (!$user) {
                fail(401, 'User not found');
            }
            respond(normalize_user($user, 'online'));
        }

        if ($method === 'GET' && $action === 'users') {
            $currentId = require_login();
            $rows = $pdo->query('SELECT * FROM queueing_users ORDER BY id')->fetchAll();
            respond(array_map(fn($u) => normalize_user($u, (int) $u['id'] === $currentId ? 'online' : 'offline'), $rows));
        }

        if ($method === 'POST' && $action === 'logout') {
            if (!empty($_SESSION['user_id'])) {
                $pdo->prepare('UPDATE queueing_users SET last_seen = ? WHERE id = ?')->execute([date('Y-m-d H:i:s.u'), $_SESSION['user_id']]);
            }
            session_destroy();
            respond(['message' => 'Logged out successfully']);
        }

        if ($method === 'POST' && $action === 'register') {
            require_login();
            $body = json_body();
            $stmt = $pdo->prepare('SELECT id FROM queueing_users WHERE email = ?');
            $stmt->execute([$body['email'] ?? '']);
            if ($stmt->fetch()) {
                fail(400, 'email already registered');
            }
            $stmt = $pdo->prepare(
                'INSERT INTO queueing_users (email, name, password, division, created_at, last_seen)
                 VALUES (?, ?, ?, ?, ?, NULL)'
            );
            $stmt->execute([
                $body['email'] ?? '',
                $body['name'] ?? '',
                password_hash((string) ($body['password'] ?? ''), PASSWORD_BCRYPT),
                strtolower((string) ($body['division'] ?? '')),
                date('Y-m-d H:i:s.u'),
            ]);
            respond(normalize_user(get_item_user($pdo, (int) $pdo->lastInsertId()) ?? []), 200);
        }

        if (($action === 'users') && isset($parts[2])) {
            $userId = (int) $parts[2];
            $currentId = require_login();
            if ($method === 'PUT') {
                $body = json_body();
                $stmt = $pdo->prepare('SELECT id FROM queueing_users WHERE email = ? AND id <> ?');
                $stmt->execute([$body['email'] ?? '', $userId]);
                if ($stmt->fetch()) {
                    fail(400, 'Email already registered by another user');
                }
                $fields = ['email = ?', 'name = ?', 'division = ?'];
                $params = [$body['email'] ?? '', $body['name'] ?? '', strtolower((string) ($body['division'] ?? ''))];
                if (!empty($body['password'])) {
                    $fields[] = 'password = ?';
                    $params[] = password_hash((string) $body['password'], PASSWORD_BCRYPT);
                }
                $params[] = $userId;
                $pdo->prepare('UPDATE queueing_users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
                if ($currentId === $userId) {
                    $_SESSION['email'] = $body['email'] ?? '';
                    $_SESSION['name'] = $body['name'] ?? '';
                    $_SESSION['division'] = strtolower((string) ($body['division'] ?? ''));
                }
                respond(normalize_user(get_item_user($pdo, $userId) ?? []));
            }
            if ($method === 'DELETE') {
                if ($currentId === $userId) {
                    fail(400, 'Cannot delete your own account');
                }
                $pdo->prepare('DELETE FROM queueing_users WHERE id = ?')->execute([$userId]);
                respond(['message' => 'User deleted successfully']);
            }
        }
    }

    if (($parts[0] ?? '') === 'queue') {
        reset_past_cards($pdo);
        $action = $parts[1] ?? '';

        if ($method === 'GET' && $action === 'test') {
            respond(['message' => 'Hello! The PHP Queue API is working perfectly.']);
        }

        if ($method === 'GET' && $action === 'available-cards') {
            $stmt = $pdo->query("SELECT queue_no FROM queueing_queue_items WHERE LOWER(status) IN ('pending', 'processing') AND queue_no IS NOT NULL");
            $used = array_map('intval', array_column($stmt->fetchAll(), 'queue_no'));
            $all = range(1, (int) $config['max_available_cards']);
            respond(['available_cards' => array_values(array_diff($all, $used))]);
        }

        if ($method === 'POST' && $action === 'add') {
            $body = json_body();
            $queueNo = (int) ($body['queue_no'] ?? 0);
            $stmt = $pdo->query("SELECT queue_no FROM queueing_queue_items WHERE LOWER(status) IN ('pending', 'processing') AND queue_no IS NOT NULL");
            $used = array_map('intval', array_column($stmt->fetchAll(), 'queue_no'));
            if (!in_array($queueNo, range(1, (int) $config['max_available_cards']), true) || in_array($queueNo, $used, true)) {
                fail(400, "Card #$queueNo is currently in use");
            }
            $stmt = $pdo->prepare(
                'INSERT INTO queueing_queue_items (queue_no, client_name, purpose, status, division, priority, created_at, completed_at, skip_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)'
            );
            $stmt->execute([
                $queueNo,
                substr((string) ($body['client_name'] ?? ''), 0, 40),
                substr((string) ($body['purpose'] ?? ''), 0, 100),
                'pending',
                strtolower((string) ($body['division'] ?? 'lobby')),
                strtolower((string) ($body['priority'] ?? 'regular')),
                date('Y-m-d H:i:s.u'),
            ]);
            respond(item_with_score(get_item($pdo, (int) $pdo->lastInsertId()) ?? []));
        }

        if ($method === 'GET' && in_array($action, ['active', 'today', 'all'], true)) {
            [$start, $end] = today_bounds();
            if ($action === 'active') {
                $stmt = $pdo->prepare("SELECT * FROM queueing_queue_items WHERE LOWER(status) IN ('pending', 'processing') AND created_at BETWEEN ? AND ? ORDER BY created_at");
                $stmt->execute([$start, $end]);
            } elseif ($action === 'today') {
                $stmt = $pdo->prepare('SELECT * FROM queueing_queue_items WHERE created_at BETWEEN ? AND ? ORDER BY created_at');
                $stmt->execute([$start, $end]);
            } else {
                $where = [];
                $params = [];
                if (!empty($_GET['date_from'])) {
                    $where[] = 'created_at >= ?';
                    $params[] = $_GET['date_from'] . ' 00:00:00';
                }
                if (!empty($_GET['date_to'])) {
                    $where[] = 'created_at <= ?';
                    $params[] = $_GET['date_to'] . ' 23:59:59';
                }
                $sql = 'SELECT * FROM queueing_queue_items' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY created_at DESC';
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
            }
            respond(array_map('item_with_score', $stmt->fetchAll()));
        }

        if ($method === 'PUT' && $action === 'status' && isset($parts[2])) {
            $updated = update_status($pdo, (int) $parts[2], (string) (json_body()['status'] ?? ''));
            $updated ? respond(item_with_score($updated)) : fail(404, 'Queue item not found');
        }

        if ($method === 'PUT' && $action === 'edit' && isset($parts[2])) {
            $body = json_body();
            $stmt = $pdo->prepare('UPDATE queueing_queue_items SET client_name = ?, purpose = ?, division = ?, priority = ? WHERE id = ?');
            $stmt->execute([
                substr((string) ($body['client_name'] ?? ''), 0, 40),
                substr((string) ($body['purpose'] ?? ''), 0, 100),
                strtolower((string) ($body['division'] ?? '')),
                strtolower((string) ($body['priority'] ?? 'regular')),
                (int) $parts[2],
            ]);
            $updated = get_item($pdo, (int) $parts[2]);
            $updated ? respond(item_with_score($updated)) : fail(404, 'Queue item not found');
        }

        if ($method === 'DELETE' && $action === 'items' && isset($parts[2])) {
            $item = get_item($pdo, (int) $parts[2]);
            if (!$item) {
                fail(404, 'Item not found');
            }
            $pdo->prepare('DELETE FROM queueing_queue_items WHERE id = ?')->execute([(int) $parts[2]]);
            respond(item_with_score($item));
        }

        if ($method === 'PUT' && $action === 'call-next') {
            $next = call_next($pdo);
            $next ? respond(item_with_score($next)) : fail(404, 'List is empty');
        }

        if ($method === 'PUT' && $action === 'skip-and-call-next') {
            [$start, $end] = today_bounds();
            $stmt = $pdo->prepare("SELECT * FROM queueing_queue_items WHERE LOWER(status) = 'processing' AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 1");
            $stmt->execute([$start, $end]);
            $current = $stmt->fetch();
            if (!$current) {
                respond(['skipped' => false, 'next' => null, 'detail' => 'No current item is processing.']);
            }
            update_status($pdo, (int) $current['id'], 'pending');
            $stmt = $pdo->prepare("SELECT id FROM queueing_queue_items WHERE LOWER(status) = 'pending' AND created_at BETWEEN ? AND ? AND skip_count > 0");
            $stmt->execute([$start, $end]);
            $exclude = array_map('intval', array_column($stmt->fetchAll(), 'id'));
            $next = call_next($pdo, $exclude);
            if (!$next) {
                $pdo->prepare("UPDATE queueing_queue_items SET skip_count = 0 WHERE LOWER(status) = 'pending' AND created_at BETWEEN ? AND ? AND skip_count > 0")->execute([$start, $end]);
                $next = call_next($pdo);
            }
            $next ? respond(item_with_score($next)) : respond(['skipped' => true, 'next' => null, 'detail' => 'Skipped, but no one else is waiting.']);
        }

        if ($action === 'announcement') {
            $file = __DIR__ . '/announcement.txt';
            if ($method === 'GET') {
                respond(['message' => is_file($file) ? (string) file_get_contents($file) : '']);
            }
            if ($method === 'POST') {
                $message = substr((string) (json_body()['message'] ?? ''), 0, 400);
                file_put_contents($file, $message);
                respond(['message' => $message]);
            }
        }

        if ($method === 'GET' && $action === 'statistics' && ($parts[2] ?? '') === 'completed') {
            respond(queue_statistics($pdo, (string) ($_GET['range'] ?? 'today'), (string) ($_GET['div'] ?? 'lobby')));
        }
    }

    fail(404, 'Endpoint not found');
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}

function get_item_user(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM queueing_users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function queue_statistics(PDO $pdo, string $range, string $div): array
{
    $now = new DateTimeImmutable();
    $start = $now->setTime(0, 0, 0);
    $end = null;
    $groupFormat = '%Y-%m-%d';

    if ($range === 'today') {
        $groupFormat = '%H:00';
        $end = $start->modify('+1 day');
    } elseif ($range === 'yesterday') {
        $groupFormat = '%H:00';
        $end = $start;
        $start = $start->modify('-1 day');
    } elseif ($range === '7days') {
        $start = $start->modify('-7 days');
        $end = $now;
    } elseif ($range === 'month') {
        $start = $now->modify('first day of this month')->setTime(0, 0, 0);
        $end = $now->modify('first day of next month')->setTime(0, 0, 0);
    } elseif ($range === 'year') {
        $groupFormat = '%Y-%m';
        $start = $now->setDate((int) $now->format('Y'), 1, 1)->setTime(0, 0, 0);
    } else {
        return ['data' => []];
    }

    $where = [
        "LOWER(status) IN ('completed', 'cancelled', 'pending')",
        "(CASE WHEN LOWER(status) = 'pending' THEN created_at ELSE completed_at END) >= ?",
    ];
    $params = [$start->format('Y-m-d H:i:s')];
    if ($end) {
        $where[] = "(CASE WHEN LOWER(status) = 'pending' THEN created_at ELSE completed_at END) < ?";
        $params[] = $end->format('Y-m-d H:i:s');
    }
    if ($div && !in_array(strtolower($div), ['lobby', 'sadmin'], true)) {
        $where[] = 'LOWER(division) = ?';
        $params[] = strtolower($div);
    }

    $sql = "SELECT DATE_FORMAT(CASE WHEN LOWER(status) = 'pending' THEN created_at ELSE completed_at END, ?) AS date,
                   LOWER(division) AS division,
                   LOWER(status) AS status,
                   COUNT(id) AS count
            FROM queueing_queue_items
            WHERE " . implode(' AND ', $where) . "
            GROUP BY date, division, status
            ORDER BY date";
    array_unshift($params, $groupFormat);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $result = [];
    foreach ($stmt->fetchAll() as $row) {
        $date = (string) $row['date'];
        $status = (string) $row['status'];
        $division = (string) $row['division'];
        $count = (int) $row['count'];
        $result[$date] ??= [
            'date' => $date,
            'completed' => 0,
            'cancelled' => 0,
            'pending' => 0,
            'completed_divisions' => [],
            'cancelled_divisions' => [],
            'pending_divisions' => [],
        ];
        $result[$date][$status] += $count;
        $result[$date][$status . '_divisions'][$division] = $count;
    }

    return ['data' => array_values($result)];
}
