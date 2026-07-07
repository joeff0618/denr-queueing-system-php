<?php
// Hostinger / shared-hosting database settings.
// Edit these values after creating your MySQL database in Hostinger hPanel.
return [
    'db_host' => '127.0.0.1',
    'db_name' => 'queue_db',
    'db_user' => 'root',
    'db_pass' => 'password',
    'timezone' => 'Asia/Manila',
    'max_available_cards' => 30,
    'aging_rate' => 4.0,
    'priority_weights' => [
        'pwd' => 100,
        'senior' => 80,
        'mother' => 70,
        'regular' => 50,
    ],
];
