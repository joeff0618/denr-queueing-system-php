<?php
declare(strict_types=1);

/**
 * Normalizes a status string to match the Status enum values.
 * Returns the matched status value, or the original lowercase string.
 *
 * @param string|null $status Raw status string
 * @return string Normalized status
 */
function normalize_status(?string $status): string
{
    $val = strtolower((string) $status);
    $enum = Status::tryFrom($val);
    return $enum ? $enum->value : $val;
}

/**
 * Normalizes a division string to match the Division enum values.
 * Returns the matched division value, or the original lowercase string.
 *
 * @param string|null $division Raw division name
 * @return string Normalized division
 */
function normalize_division(?string $division): string
{
    $val = strtolower((string) $division);
    $enum = Division::tryFrom($val);
    return $enum ? $enum->value : $val;
}

/**
 * Normalizes database fields of a queue item row into consistent types and structures.
 *
 * @param array $row Database row from queueing_queue_items
 * @return array Normalized queue item array
 */
function normalize_item(array $row): array
{
    $pVal = strtolower((string) $row['priority']);
    $priority = PriorityType::tryFrom($pVal)?->value ?? $pVal;
    return [
        'id' => (int) $row['id'],
        'queue_no' => isset($row['queue_no']) ? (int) $row['queue_no'] : null,
        'client_name' => $row['client_name'],
        'purpose' => $row['purpose'],
        'status' => normalize_status($row['status']),
        'division' => normalize_division($row['division']),
        'priority' => $priority,
        'created_at' => $row['created_at'],
        'completed_at' => $row['completed_at'],
        'skip_count' => (int) ($row['skip_count'] ?? 0),
    ];
}

/**
 * Normalizes database fields of a user row into a consistent array format.
 *
 * @param array $row Database row from queueing_users
 * @param string $status Custom status ('online' / 'offline')
 * @return array Normalized user array
 */
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

/**
 * Computes the priority score of a queue item based on its priority weight and queue time.
 * Calculates aging (waiting duration * aging rate) and adds it to the priority base weight.
 *
 * @param array $item Normalized queue item
 * @return float Computed priority score
 */
function priority_score(array $item): float
{
    global $config;
    $weights = $config['priority_weights'] ?? [
        PriorityType::REGULAR->value => 50,
        PriorityType::PWD->value => 100,
        PriorityType::SENIOR->value => 80,
        PriorityType::MOTHER->value => 70
    ];
    $agingRate = (float) ($config['aging_rate'] ?? 4.0);

    $priority = strtolower((string) $item['priority']);
    $base = $weights[$priority] ?? 50;
    $created = strtotime((string) $item['created_at']);
    $minutes = max((time() - ($created ?: time())) / 60, 0);
    return $base + ($minutes * $agingRate);
}

/**
 * Normalizes a queue item and appends its effective priority score if it is pending.
 *
 * @param array $row Database row of queue item
 * @return array Normalized item including effective priority score
 */
function item_with_score(array $row): array
{
    $item = normalize_item($row);
    if ($item['status'] === Status::PENDING->value) {
        $item['effective_priority'] = round(priority_score($item), 1);
    }
    return $item;
}

/**
 * Returns date-time bounds (start and end) for the current day.
 * Used for filtering queue entries created today.
 *
 * @return array Array containing [start_datetime, end_datetime]
 */
function today_bounds(): array
{
    return [date('Y-m-d 00:00:00'), date('Y-m-d 23:59:59')];
}
