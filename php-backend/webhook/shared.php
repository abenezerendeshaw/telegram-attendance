<?php
// ── Shared Default Specific Ethiopian Bot Webhook ─────────────────────────
// Handles the DEFAULT bot token (set by the super admin in System Settings).
// It routes each message to the company whose telegram_chat_id matches the
// chat the message came from, then delegates to the same command handlers.
//
// Webhook URL: /webhook/shared

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';
require_once __DIR__ . '/../includes/webhook_handlers.php';

// GET request in a browser → redirect to the generic mini app login portal
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $portal = "https://global-attendace.vercel.app/";
    header("Location: {$portal}");
    exit;
}

$TOKEN = get_default_bot_token();
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

// ── Route to the company that owns this chat ──────────────────────────────
$stmt = db()->prepare('SELECT c.*, cs.* FROM companies c LEFT JOIN company_settings cs ON cs.company_id = c.id WHERE cs.telegram_chat_id = ? LIMIT 1');
$stmt->execute([(string)$chatId]);
$company = $stmt->fetch();

if (!$company) {
    // No company matched this chat. Prompt them to open the mini app.
    tg_send($TOKEN, 'sendMessage', [
        'chat_id'      => $chatId,
        'text'         => "👋 ሰላም {$firstName}!\n\nእንኳን ወደ *Specific Ethiopian — የመገኘት መዝገቢያ* መጡ! 🎼\n\n"
                        . "ስለዚህ ቦት የበለጠ ለማወቅ ከታች ያለውን ቁልፍ ይጫኑ።",
        'parse_mode'   => 'Markdown',
        'reply_markup' => [
            'inline_keyboard' => [[
                ['text' => '📋 ወደ Mini App ይግቡ / Open Mini App', 'web_app' => ['url' => 'https://global-attendace.vercel.app/']],
            ]],
        ],
    ]);
    http_response_code(200); die('ok');
}

// ── Admin mode for the shared bot (route by chat_id + admin ids) ─────────
$isAdminBot = ($_GET['bot'] ?? '') === 'admin';
$TOKEN = $isAdminBot
    ? ($company['admin_bot_token'] ?: $TOKEN)
    : $TOKEN;

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