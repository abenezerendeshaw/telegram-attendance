<?php
// ── Telegram API wrapper (pure cURL, no dependencies) ────────────────────

function tg_send(string $token, string $method, array $params = []): ?array {
    $url = "https://api.telegram.org/bot{$token}/{$method}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($params),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    if (!$resp) return null;
    return json_decode($resp, true);
}

// Send a plain text message (splits if >4000 chars)
function tg_message(string $token, string $chatId, string $text, array $extra = []): void {
    $limit  = 4000;
    $chunks = [];

    if (mb_strlen($text) <= $limit) {
        $chunks[] = $text;
    } else {
        $lines   = explode("\n", $text);
        $current = '';
        foreach ($lines as $line) {
            if (mb_strlen($current) + mb_strlen($line) + 1 > $limit) {
                $chunks[] = $current;
                $current  = '';
            }
            $current .= $line . "\n";
        }
        if (trim($current)) $chunks[] = $current;
    }

    foreach ($chunks as $chunk) {
        tg_send($token, 'sendMessage', array_merge([
            'chat_id'    => $chatId,
            'text'       => $chunk,
            'parse_mode' => 'Markdown',
        ], $extra));
    }
}

// Send a photo via URL or file_id
function tg_photo(string $token, string $chatId, string $photoPath, string $caption = ''): void {
    $url = "https://api.telegram.org/bot{$token}/sendPhoto";
    $ch  = curl_init($url);

    $fields = [
        'chat_id' => $chatId,
        'photo'   => new CURLFile($photoPath),
        'caption' => $caption,
    ];
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $fields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

// Register a webhook URL with Telegram
function tg_set_webhook(string $token, string $webhookUrl): array {
    $result = tg_send($token, 'setWebhook', ['url' => $webhookUrl, 'allowed_updates' => ['message','callback_query']]);
    return $result ?? ['ok' => false, 'description' => 'No response from Telegram'];
}

// Get bot info
function tg_get_me(string $token): ?array {
    return tg_send($token, 'getMe');
}
