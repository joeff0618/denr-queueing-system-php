<?php
declare(strict_types=1);

function get_item_user(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM queueing_users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}
