<?php
// ── POST /api/receipt.php?c=[slug] ────────────────────────────────────────
// Handles payment receipt image uploads. Only works if company has enabled it.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/sheets.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

set_cors();
ensure_company_settings_columns();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'Method Not Allowed'], 405);

$slug = param('c');
if (!$slug) json_out(['error' => 'Missing company slug'], 400);

$company = get_company_by_slug($slug);
if (!$company) json_out(['error' => 'Company not found'], 404);
if (!$company['enable_receipt_upload']) json_out(['error' => 'Receipt upload is disabled for this institution.'], 403);

// ── Parse multipart OR base64 JSON body ──────────────────────────────────
$payerName   = '';
$studentName = '';
$fileData    = ''; // base64 data URI (any file type: image, pdf, doc, ...)
$fileName    = '';

// Try JSON body first (React sends base64)
$body = json_body();
if ($body) {
    $payerName   = trim($body['payerName'] ?? '');
    // Accept studentNames (array) or studentName (string)
    $names = $body['studentNames'] ?? [];
    if (is_string($names)) {
        $names = array_map('trim', explode(',', $names));
    }
    $names = array_values(array_filter(array_map('trim', (array)$names), fn($n) => $n !== ''));
    $studentName = $names ? implode(', ', $names) : trim($body['studentName'] ?? '');
    $fileData    = $body['fileData'] ?? ($body['imageData'] ?? '');
    $fileName    = trim($body['fileName'] ?? '');
}

if (!$payerName || !$studentName || !$fileData) {
    json_out(['error' => 'ሁሉም መስኮች አስፈላጊ ናቸው። / All fields are required.'], 400);
}

// ── Decode and save file (images, PDF, DOC, etc.) ─────────────────────────
if (!preg_match('/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,/', $fileData, $matches)) {
    json_out(['error' => 'Invalid file format.'], 400);
}
$mimeType = strtolower($matches[1]);

// Map MIME type / original file name to a safe extension
$mimeExt = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
    'application/pdf' => 'pdf',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'text/csv' => 'csv',
    'text/plain' => 'txt',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
];
$ext = $mimeExt[$mimeType] ?? strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
if (!in_array($ext, ['jpg','jpeg','png','webp','gif','pdf','doc','docx','csv','txt','xls','xlsx'], true)) {
    $ext = 'bin';
}
if ($ext === 'jpeg') $ext = 'jpg';

$rawData = base64_decode(preg_replace('/^data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,/', '', $fileData));

if (strlen($rawData) > 10 * 1024 * 1024) {
    json_out(['error' => 'File must be under 10MB.'], 400);
}

$uploadDir = dirname(__DIR__) . '/uploads/receipts/' . $company['slug'] . '/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$storedName = date('Y-m-d_H-i-s') . '_' . random_token(8) . ".{$ext}";
$filePath   = $uploadDir . $storedName;
file_put_contents($filePath, $rawData);

// ── Save to DB ────────────────────────────────────────────────────────────
$stmt = db()->prepare(
    'INSERT INTO receipt_uploads (company_id, payer_name, student_name, file_path)
     VALUES (?, ?, ?, ?)'
);
$stmt->execute([$company['id'], $payerName, $studentName, $company['slug'] . '/' . $storedName]);

// ── Send to Telegram ──────────────────────────────────────────────────────
$botToken = $company['telegram_bot_token'] ?: get_default_bot_token();
$chatId   = $company['telegram_chat_id']   ?? '';
if ($botToken && $chatId) {
    $caption = "💳 *ደረሰኝ / Receipt*\n\n"
             . "🙋 *ክፍያ ፈጻሚ:* {$payerName}\n"
             . "👤 *ተማሪ / Employee:* {$studentName}\n"
             . "🕐 " . date('Y-m-d H:i');

    $payload = ['chat_id' => $chatId, 'caption' => $caption, 'parse_mode' => 'Markdown'];
    if ($company['telegram_topic_receipt']) {
        $payload['message_thread_id'] = (int)$company['telegram_topic_receipt'];
    }

    // Images go as photo; any other file type goes as a document
    $isImage = str_starts_with($mimeType, 'image/');
    $method  = $isImage ? 'sendPhoto' : 'sendDocument';
    $fileKey = $isImage ? 'photo' : 'document';
    $mime    = $isImage ? 'image/' . $ext : $mimeType;
    $name    = $fileName ?: $storedName;

    $url = "https://api.telegram.org/bot{$botToken}/{$method}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => array_merge($payload, [$fileKey => new CURLFile($filePath, $mime, $name)]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $result = curl_exec($ch);
    curl_close($ch);

    if ($result) {
        $tgResp = json_decode($result, true);
        if (!empty($tgResp['result']['message_id'])) {
            db()->prepare('UPDATE receipt_uploads SET telegram_message_id = ? WHERE file_path = ?')
                ->execute([$tgResp['result']['message_id'], $company['slug'] . '/' . $storedName]);
        }
    }
}

// ── Append to Google Sheets (optional) ────────────────────────────────────
// Uses the same daily-column layout as attendance: each student is a row and
// every receipt date becomes a new column (💳 marks the paid students).
if ($company['enable_google_sheets'] && $company['google_sheet_id'] && $company['google_service_account_json']) {
    $creds = parse_service_account($company['google_service_account_json']);
    if ($creds) {
        $tab = $company['google_sheet_receipt_tab'] ?: 'Receipts';
        sheets_ensure_tab($creds, $company['google_sheet_id'], $tab);
        $dateLabel = get_ethiopian_date();

        // Resolve each selected student to their member row info (name, english, group, branch)
        $names = explode(',', $studentName);
        $names = array_values(array_filter(array_map('trim', $names), fn($n) => $n !== ''));
        $lookup = db()->prepare(
            'SELECT m.name, m.english_name, m.group_name, b.name AS branch_name
             FROM members m
             LEFT JOIN branches b ON b.id = m.branch_id
             WHERE m.company_id = ? AND m.is_active = 1'
        );
        $lookup->execute([$company['id']]);
        $memberRows = $lookup->fetchAll();

        $byName = [];
        foreach ($memberRows as $mr) $byName[$mr['name']] = $mr;

        foreach ($names as $n) {
            $mr = $byName[$n] ?? null;
            sheets_mark_receipt($creds, $company['google_sheet_id'], $tab, [
                'amharic' => $mr['name'] ?? $n,
                'english' => $mr['english_name'] ?? '',
                'group'   => $mr['group_name'] ?? '',
                'branch'  => $mr['branch_name'] ?? '',
            ], $dateLabel);
        }
    }
}

json_out(['success' => true, 'message' => '✅ ደረሰኙ በተሳካ ሁኔታ ተልኳል። / Receipt submitted successfully.']);
