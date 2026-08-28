<?php
// ── Universal Telegram Webhook ────────────────────────────────────────────
// Handles ALL company bots via .htaccess rewrite:
//   /webhook/[slug]      → /webhook/index.php?c=[slug]
//   /webhook/[slug]?bot=admin → admin bot mode

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';
require_once __DIR__ . '/../includes/webhook_handlers.php';

// ── Load company ──────────────────────────────────────────────────────────
$slug = $_GET['c'] ?? '';
if (!$slug) { http_response_code(404); die('Not found'); }

$company = get_company_by_slug($slug);
if (!$company) { http_response_code(404); die('Company not found'); }

$isAdminBot = ($_GET['bot'] ?? '') === 'admin';
$TOKEN      = $isAdminBot
    ? ($company['admin_bot_token']    ?? '')
    : ($company['telegram_bot_token'] ?? '');

// If opened in a web browser (GET request), redirect to the attendance mini app
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $webAppUrl = !empty($company['webapp_url'])
        ? $company['webapp_url']
        : "https://global-attendace.vercel.app/?c={$company['slug']}";
    if ($isAdminBot) $webAppUrl .= '#admin';
    header("Location: {$webAppUrl}");
    exit;
}

if (!$TOKEN) { http_response_code(200); die('ok'); }

// ── Parse Telegram update ─────────────────────────────────────────────────
$update  = json_decode(file_get_contents('php://input'), true);
if (!$update) { http_response_code(200); die('ok'); }

$message = $update['message'] ?? null;
if (!$message || !isset($message['text'])) { http_response_code(200); die('ok'); }

$chatId    = $message['chat']['id'];
$userId    = $message['from']['id'] ?? 0;
$firstName = $message['from']['first_name'] ?? 'ወዳጃችን';
$text      = trim($message['text']);

// ── Admin auth check (admin bot only) ────────────────────────────────────
if ($isAdminBot) {
    $adminIds = array_filter(array_map('trim', explode(',', $company['admin_bot_admins'] ?? '')));
    if (!empty($adminIds) && !in_array((string)$userId, $adminIds, true)) {
        tg_message($TOKEN, $chatId, '⛔ ይቅርታ! ይህን ቦት ለመጠቀም ፈቃድ የለዎትም። / Unauthorized.');
        http_response_code(200); die('ok');
    }
    handle_admin_command($TOKEN, $chatId, $text, $firstName, $company, $message);
} else {
    handle_student_command($TOKEN, $chatId, $text, $firstName, $company);
}

http_response_code(200);
echo 'ok';