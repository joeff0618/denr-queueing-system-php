<?php
declare(strict_types=1);

/**
 * Resets physical queue numbers (queue_no) to NULL for past dates.
 * Applies to pending, processing, and forwarded items created before today.
 * 
 * @param PDO $pdo PDO database connection.
 * @return void
 */
function reset_past_cards(PDO $pdo): void
{
    $today = date('Y-m-d 00:00:00');
    $stmt = $pdo->prepare(
        "UPDATE queueing_queue_items
         SET queue_no = NULL
         WHERE LOWER(status) IN ('" . Status::PENDING->value . "', '" . Status::PROCESSING->value . "', '" . Status::FORWARDED->value . "')
           AND created_at < ?
           AND queue_no IS NOT NULL"
    );
    $stmt->execute([$today]);
}

/**
 * Retrieves a single queue item by its ID.
 * 
 * @param PDO $pdo PDO database connection.
 * @param int $id The queue item ID.
 * @return array|null The queue item row or null if not found.
 */
function get_item(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM queueing_queue_items WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Updates the status of a queue item.
 * Manages side effects like incrementing skip count or setting completion timestamp.
 * 
 * @param PDO $pdo PDO database connection.
 * @param int $id The queue item ID.
 * @param string $status Target status (e.g., 'pending', 'processing', 'completed', 'deferred').
 * @return array|null The updated queue item row, or null on failure.
 */
function update_status(PDO $pdo, int $id, string $status): ?array
{
    $current = get_item($pdo, $id);
    if (!$current) {
        return null;
    }

    $status = strtolower($status);
    $completedAt = in_array($status, [Status::COMPLETED->value, Status::DEFERRED->value], true) ? date('Y-m-d H:i:s.u') : null;
    $createdAt = $current['created_at'];
    $skipCount = (int) ($current['skip_count'] ?? 0);

    if ($status === Status::PENDING->value && normalize_status($current['status']) === Status::PROCESSING->value) {
        $createdAt = date('Y-m-d H:i:s.u');
        $skipCount++;
    }
    if ($status === Status::PROCESSING->value) {
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

/**
 * Identifies and calls the next pending queue item for the day based on priority score.
 * Updates the item's status to processing.
 * 
 * @param PDO $pdo PDO database connection.
 * @param array $excludeIds List of queue item IDs to exclude from selection.
 * @return array|null The called queue item row, or null if queue is empty.
 */
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
         WHERE LOWER(status) = '" . Status::PENDING->value . "'
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

    return update_status($pdo, (int) $items[0]['id'], Status::PROCESSING->value);
}

/**
 * Generates aggregated queue statistics for a given range (e.g. today, yesterday, month) and division.
 * 
 * @param PDO $pdo PDO database connection.
 * @param string $range Timeframe range ('today', 'yesterday', '7days', 'month', 'year').
 * @param string $div Division code filter.
 * @return array Formatted statistical dataset for graphing.
 */
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

    $pending = Status::PENDING->value;
    $completed = Status::COMPLETED->value;
    $deferred = Status::DEFERRED->value;

    $where = [
        "LOWER(status) IN ('$completed', '$deferred', '$pending')",
        "(CASE WHEN LOWER(status) = '$pending' THEN created_at ELSE completed_at END) >= ?",
    ];
    $params = [$start->format('Y-m-d H:i:s')];
    if ($end) {
        $where[] = "(CASE WHEN LOWER(status) = '$pending' THEN created_at ELSE completed_at END) < ?";
        $params[] = $end->format('Y-m-d H:i:s');
    }
    if ($div && !in_array(strtolower($div), [Division::LOBBY->value, Division::SADMIN->value], true)) {
        if (strtolower($div) === Division::SMD->value) {
            $where[] = "LOWER(division) IN ('smd', 'r-smd', 'sr-smd')";
        } else {
            $where[] = 'LOWER(division) = ?';
            $params[] = strtolower($div);
        }
    }

    $sql = "SELECT DATE_FORMAT(CASE WHEN LOWER(status) = '$pending' THEN created_at ELSE completed_at END, ?) AS date,
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
            $completed => 0,
            $deferred => 0,
            $pending => 0,
            $completed . '_divisions' => [],
            $deferred . '_divisions' => [],
            $pending . '_divisions' => [],
        ];
        $result[$date][$status] += $count;
        $result[$date][$status . '_divisions'][$division] = $count;
    }

    return ['data' => array_values($result)];
}
