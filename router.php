<?php
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// 1. Rewrite /api/(.*) to backend/index.php
if (preg_match('#^/api/(.*)$#', $uri, $matches)) {
    $_GET['path'] = $matches[1];
    include __DIR__ . '/backend/index.php';
    exit;
}

// 2. If it points to an existing file in the project, serve it
if ($uri !== '/' && file_exists(__DIR__ . $uri)) {
    return false; // Built-in web server handles this directly
}

// 3. Mimic the .htaccess rules for frontend routing
if (preg_match('#^/(assets|login|tv|operator|monitoring|client)(/.*)?$#', $uri, $matches)) {
    $module = $matches[1];
    $subpath = $matches[2] ?? '';
    
    // Serve index.html if no subpath is provided
    if ($subpath === '' || $subpath === '/') {
        $file = __DIR__ . "/frontend/$module/index.html";
    } else {
        $file = __DIR__ . "/frontend/$module$subpath";
    }
    
    if (file_exists($file)) {
        // Set proper Content-Type header
        $ext = pathinfo($file, PATHINFO_EXTENSION);
        if ($ext === 'css') {
            header('Content-Type: text/css');
        } elseif ($ext === 'js') {
            header('Content-Type: application/javascript');
        } elseif ($ext === 'svg') {
            header('Content-Type: image/svg+xml');
        } elseif ($ext === 'png') {
            header('Content-Type: image/png');
        } elseif ($ext === 'jpg' || $ext === 'jpeg') {
            header('Content-Type: image/jpeg');
        }
        readfile($file);
        exit;
    }
}

// 4. Default: Redirect root '/' to login page as index.php does
if ($uri === '/' || $uri === '/index.php') {
    include __DIR__ . '/index.php';
    exit;
}

return false;
