<?php
// ── POST /api/login.php ───────────────────────────────────────────────────
// Mini-app login for the shared Specific Ethiopian bot.
// Accepts JSON { username, password }, verifies against the companies table,
// and returns the company slug so the mini app can load its data.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';

set_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'Method not allowed'], 405);
}

$body = json_body();
$username = trim($body['username'] ?? '');
$password = $body['password'] ?? '';

if (!$username || !$password) {
    json_out(['error' => 'Username and password are required'], 400);
}

$stmt = db()->prepare('SELECT * FROM companies WHERE username = ? AND is_active = 1 LIMIT 1');
$stmt->execute([$username]);
$company = $stmt->fetch();

if (!$company || !password_verify($password, $company['password_hash'])) {
    json_out(['error' => 'Invalid username or password'], 401);
}

$defaultLogo = BASE_URL . '/assets/img/register-panel.jpg';

json_out([
    'success'      => true,
    'slug'         => $company['slug'],
    'name'         => $company['name'],
    'logo'         => !empty($company['logo_path'])
                         ? BASE_URL . '/uploads/logos/' . basename($company['logo_path'])
                         : $defaultLogo,
    'cover'        => !empty($company['cover_image'])
                         ? BASE_URL . '/uploads/covers/' . basename($company['cover_image'])
                         : $defaultLogo,
    'primaryColor' => $company['primary_color'] ?? '#d97706',
]);
