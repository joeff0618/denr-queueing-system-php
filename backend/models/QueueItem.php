<?php
declare(strict_types=1);

function reset_past_cards(PDO $pdo): void
{
    $today = date('Y-m-d 00:00:00');
    $stmt = $pdo->prepare(
        "UPDATE queueing_queue_items
         SET queue_no = NULL
         WHERE LOWER(status) IN ('pending', 'processing', 'forwarded')
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
