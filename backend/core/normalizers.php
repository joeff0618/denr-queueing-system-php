<?php
declare(strict_types=1);

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
