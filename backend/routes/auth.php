<?php
declare(strict_types=1);

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
    $currentId = require_sadmin($pdo);
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
    require_sadmin($pdo);
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
    if ($currentId !== $userId) {
        require_sadmin($pdo);
    }
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
        require_sadmin($pdo);
        if ($currentId === $userId) {
            fail(400, 'Cannot delete your own account');
        }
        $pdo->prepare('DELETE FROM queueing_users WHERE id = ?')->execute([$userId]);
        respond(['message' => 'User deleted successfully']);
    }
}

fail(404, 'Auth action not found');
