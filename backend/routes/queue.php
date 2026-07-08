<?php
declare(strict_types=1);

reset_past_cards($pdo);
$action = $parts[1] ?? '';

if ($method === 'GET' && $action === 'test') {
    respond(['message' => 'Hello! The PHP Queue API is working perfectly.']);
}

if ($method === 'GET' && $action === 'available-cards') {
    $stmt = $pdo->query("SELECT queue_no FROM queueing_queue_items WHERE LOWER(status) IN ('" . Status::PENDING->value . "', '" . Status::PROCESSING->value . "', '" . Status::FORWARDED->value . "') AND queue_no IS NOT NULL");
    $used = array_map('intval', array_column($stmt->fetchAll(), 'queue_no'));
    $all = range(1, (int) $config['max_available_cards']);
    respond(['available_cards' => array_values(array_diff($all, $used))]);
}

if ($method === 'POST' && $action === 'add') {
    $body = json_body();
    $queueNo = (int) ($body['queue_no'] ?? 0);
    $stmt = $pdo->query("SELECT queue_no FROM queueing_queue_items WHERE LOWER(status) IN ('" . Status::PENDING->value . "', '" . Status::PROCESSING->value . "', '" . Status::FORWARDED->value . "') AND queue_no IS NOT NULL");
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
        Status::PENDING->value,
        strtolower((string) ($body['division'] ?? Division::LOBBY->value)),
        strtolower((string) ($body['priority'] ?? PriorityType::REGULAR->value)),
        date('Y-m-d H:i:s.u'),
    ]);
    respond(item_with_score(get_item($pdo, (int) $pdo->lastInsertId()) ?? []));
}

if ($method === 'GET' && in_array($action, ['active', 'today', 'all'], true)) {
    [$start, $end] = today_bounds();
    if ($action === 'active') {
        $stmt = $pdo->prepare("SELECT * FROM queueing_queue_items WHERE LOWER(status) IN ('" . Status::PENDING->value . "', '" . Status::PROCESSING->value . "') AND created_at BETWEEN ? AND ? ORDER BY created_at");
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
        strtolower((string) ($body['priority'] ?? PriorityType::REGULAR->value)),
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
    $stmt = $pdo->prepare("SELECT * FROM queueing_queue_items WHERE LOWER(status) = '" . Status::PROCESSING->value . "' AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 1");
    $stmt->execute([$start, $end]);
    $current = $stmt->fetch();
    if (!$current) {
        respond(['skipped' => false, 'next' => null, 'detail' => 'No current item is processing.']);
    }
    update_status($pdo, (int) $current['id'], Status::PENDING->value);
    $stmt = $pdo->prepare("SELECT id FROM queueing_queue_items WHERE LOWER(status) = '" . Status::PENDING->value . "' AND created_at BETWEEN ? AND ? AND skip_count > 0");
    $stmt->execute([$start, $end]);
    $exclude = array_map('intval', array_column($stmt->fetchAll(), 'id'));
    $next = call_next($pdo, $exclude);
    if (!$next) {
        $pdo->prepare("UPDATE queueing_queue_items SET skip_count = 0 WHERE LOWER(status) = '" . Status::PENDING->value . "' AND created_at BETWEEN ? AND ? AND skip_count > 0")->execute([$start, $end]);
        $next = call_next($pdo);
    }
    $next ? respond(item_with_score($next)) : respond(['skipped' => true, 'next' => null, 'detail' => 'Skipped, but no one else is waiting.']);
}

if ($action === 'announcement') {
    $file = dirname(__DIR__) . '/announcement.txt';
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
    respond(queue_statistics($pdo, (string) ($_GET['range'] ?? 'today'), (string) ($_GET['div'] ?? Division::LOBBY->value)));
}

fail(404, 'Queue action not found');
