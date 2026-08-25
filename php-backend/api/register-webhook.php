<?php
// ── POST /api/register-webhook.php ────────────────────────────────────────
// Called from the dashboard to register a company's bot webhook with Telegram.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/telegram.php';

set_cors();

$company    = require_auth();
$body       = json_body();
$botType    = param('bot', $body, 'student'); // 'student' or 'admin'

$token = $botType === 'admin'
    ? ($company['admin_bot_token']   ?? '')
    : ($company['telegram_bot_token'] ?? '');

if (!$token) json_out(['error' => 'No bot token configured. Please save the token first.'], 400);

$slug       = $company['slug'];
$webhookUrl = "https://specificethiopian.com/evaluation/webhook/{$slug}";
if ($botType === 'admin') $webhookUrl .= '?bot=admin';

$result = tg_set_webhook($token, $webhookUrl);

if (!empty($result['ok'])) {
    // Verify bot identity
    $me = tg_get_me($token);
    json_out([
        'success'     => true,
        'webhookUrl'  => $webhookUrl,
        'botUsername' => $me['result']['username'] ?? 'unknown',
        'message'     => "✅ Webhook registered: @{$me['result']['username']}",
    ]);
} else {
    json_out([
        'success' => false,
        'error'   => $result['description'] ?? 'Telegram returned an error',
    ], 400);
}
