<?php
// ── GET /webapp.php ────────────────────────────────────────────────────────
// Opens the logged-in company's attendance mini app (Telegram Web App).
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';

$company = require_auth();
$slug = $company['slug'] ?? '';
$webapp = !empty($company['webapp_url'])
    ? $company['webapp_url']
    : 'https://global-attendace.vercel.app/';

$sep = strpos($webapp, '?') !== false ? '&' : '?';
header('Location: ' . $webapp . $sep . 'c=' . urlencode($slug));
exit;
