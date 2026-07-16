<?php
declare(strict_types=1);

/**
 * Retrieves a user record by its ID.
 * 
 * @param PDO $pdo PDO database connection.
 * @param int $id The user's ID.
 * @return array|null The user row or null if not found.
 */
function get_item_user(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM queueing_users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}
