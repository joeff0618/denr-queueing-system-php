<?php
declare(strict_types=1);

enum Status: string
{
    case PENDING = 'pending';
    case PROCESSING = 'processing';
    case FORWARDED = 'forwarded';
    case COMPLETED = 'completed';
    case CANCELLED = 'cancelled';
}
