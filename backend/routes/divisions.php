<?php
declare(strict_types=1);

/**
 * Handles operations relating to divisions including fetching, adding, updating, and deleting.
 * Only authenticated sadmin users can perform write/edit/delete requests.
 */

$action = $parts[1] ?? '';

// GET /api/divisions
if ($method === 'GET' && $action === '') {
    $stmt = $pdo->query("SELECT * FROM queueing_divisions ORDER BY display_name ASC");
    respond($stmt->fetchAll());
}

// All subsequent operations require administrative privileges
require_sadmin($pdo);

// POST /api/divisions (Create)
if ($method === 'POST' && $action === '') {
    $body = json_body();
    $name = strtolower(trim((string)($body['name'] ?? '')));
    $displayName = trim((string)($body['display_name'] ?? ''));

    if (empty($name) || empty($displayName)) {
        fail(400, 'Division name and display name are required');
    }

    // Validate name uniqueness
    $stmt = $pdo->prepare("SELECT id FROM queueing_divisions WHERE name = ?");
    $stmt->execute([$name]);
    if ($stmt->fetch()) {
        fail(400, 'Division name must be unique');
    }

    $stmt = $pdo->prepare("INSERT INTO queueing_divisions (name, display_name) VALUES (?, ?)");
    $stmt->execute([$name, $displayName]);
    
    respond([
        'id' => (int)$pdo->lastInsertId(),
        'name' => $name,
        'display_name' => $displayName
    ], 200);
}

// PUT /api/divisions/<id> (Update)
if ($method === 'PUT' && !empty($action)) {
    $id = (int)$action;
    $body = json_body();
    $name = strtolower(trim((string)($body['name'] ?? '')));
    $displayName = trim((string)($body['display_name'] ?? ''));

    if (empty($name) || empty($displayName)) {
        fail(400, 'Division name and display name are required');
    }

    // Check existence
    $stmt = $pdo->prepare("SELECT id FROM queueing_divisions WHERE id = ?");
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        fail(404, 'Division not found');
    }

    // Validate name uniqueness (excluding self)
    $stmt = $pdo->prepare("SELECT id FROM queueing_divisions WHERE name = ? AND id <> ?");
    $stmt->execute([$name, $id]);
    if ($stmt->fetch()) {
        fail(400, 'Division name must be unique');
    }

    $stmt = $pdo->prepare("UPDATE queueing_divisions SET name = ?, display_name = ? WHERE id = ?");
    $stmt->execute([$name, $displayName, $id]);

    respond([
        'id' => $id,
        'name' => $name,
        'display_name' => $displayName
    ]);
}

// DELETE /api/divisions/<id> (Delete)
if ($method === 'DELETE' && !empty($action)) {
    $id = (int)$action;

    // Check existence
    $stmt = $pdo->prepare("SELECT name FROM queueing_divisions WHERE id = ?");
    $stmt->execute([$id]);
    $division = $stmt->fetch();
    if (!$division) {
        fail(404, 'Division not found');
    }

    // Prevent deletion of sadmin and lobby
    $name = strtolower($division['name']);
    if ($name === 'sadmin' || $name === 'lobby') {
        fail(400, 'Cannot delete system-critical divisions');
    }

    $stmt = $pdo->prepare("DELETE FROM queueing_divisions WHERE id = ?");
    $stmt->execute([$id]);

    respond(['message' => 'Division deleted successfully']);
}

fail(404, 'Division action not found');
