<?php
// ── POST /api/submit.php?c=[slug] ─────────────────────────────────────────
// Records an attendance submission. Port of api/submit.js with multi-tenant support.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';
require_once __DIR__ . '/../includes/gps.php';
require_once __DIR__ . '/../includes/sheets.php';

set_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'Method Not Allowed'], 405);
}

$slug = param('c');
if (!$slug) json_out(['error' => 'Missing company slug'], 400);

$company = get_company_by_slug($slug);
if (!$company) json_out(['error' => 'Company not found'], 404);

$body          = json_body();
$fullName      = trim($body['fullName'] ?? '');
$group         = trim($body['group'] ?? '');
$status        = $body['status'] ?? 'present';
$reason        = trim($body['reason'] ?? '');
$latitude      = isset($body['latitude'])  ? (float)$body['latitude']  : null;
$longitude     = isset($body['longitude']) ? (float)$body['longitude'] : null;
$adminOverride = !empty($body['adminOverride']);

if (!$fullName) json_out(['error' => 'ሙሉ ስም ማስገባት አስፈላጊ ነው። / Full name is required.'], 400);
if (!in_array($status, ['present','permission'])) json_out(['error' => 'Invalid status'], 400);

// ── Time & day checks (skipped in admin override) ─────────────────────────
$now = eat_now();
if (!$adminOverride && !$company['allow_offtime_submission']) {
    $dayOfWeek    = (int)$now->format('w'); // 0=Sun
    $classDays    = array_map('intval', explode(',', $company['class_days'] ?? '1,3,5'));
    $isClassDay   = in_array($dayOfWeek, $classDays, true);
    $totalMinutes = (int)$now->format('G') * 60 + (int)$now->format('i');

    // Parse window (HH:MM format)
    [$wStartH, $wStartM] = array_map('intval', explode(':', $company['attendance_window_start'] ?? '23:30'));
    [$wEndH,   $wEndM  ] = array_map('intval', explode(':', $company['attendance_window_end']   ?? '02:30'));
    $wStart = $wStartH * 60 + $wStartM;
    $wEnd   = $wEndH   * 60 + $wEndM;

    if ($status === 'permission') {
        // Permission window: before 7 PM (1140 min)
        if (!$isClassDay || $totalMinutes >= 780) {
            json_out(['error' => 'ፈቃድ ማስገባት በዛሬ ቀን ወይም ሰዓት ላይ አይቻልም። / Permission not allowed at this time.'], 400);
        }
    } else {
        // Attendance window (can cross midnight)
        $inWindow = $wStart > $wEnd
            ? ($totalMinutes >= $wStart || $totalMinutes <= $wEnd)
            : ($totalMinutes >= $wStart && $totalMinutes <= $wEnd);
        if (!$isClassDay || !$inWindow) {
            json_out(['error' => 'የአቴንዳንስ መመዝገቢያ ሰዓት አልደረሰም። / Attendance window is closed.'], 400);
        }
    }
}

// ── Duplicate check ───────────────────────────────────────────────────────
if (!$adminOverride && !$company['allow_multiple_submissions']) {
    $today = $now->format('Y-m-d');
    $stmt  = db()->prepare(
        'SELECT id FROM attendance_records
         WHERE company_id = ? AND member_name LIKE ? AND DATE(submitted_at) = ? LIMIT 1'
    );
    $stmt->execute([$company['id'], $fullName, $today]);
    if ($stmt->fetch()) {
        json_out(['error' => 'ለዛሬ መዝግበዋል። / Already submitted today.'], 400);
    }
}

// ── GPS check ─────────────────────────────────────────────────────────────
if ($status === 'present' && !$adminOverride && !$company['disable_gps_check']) {
    if (!$latitude || !$longitude) {
        json_out(['error' => 'ቦታዎን ማረጋገጥ አልተቻለም። / Could not verify location.'], 400);
    }
    if (!$company['class_lat'] || !$company['class_lng']) {
        json_out(['error' => 'GPS location not configured for this institution.'], 400);
    }
    $dist = haversine_distance(
        (float)$company['class_lat'], (float)$company['class_lng'],
        $latitude, $longitude
    );
    $maxDist = (int)($company['max_distance_meters'] ?? 400);
    if ($dist > $maxDist) {
        json_out(['error' => "ከትምህርት ቦታ ውጪ ነዎት (" . round($dist) . " ሜ)። / You are {$dist}m from class."], 400);
    }
}

if ($status === 'permission' && !$reason) {
    json_out(['error' => 'እባክዎ የፈቃድ ምክንያትዎን ያስገቡ። / Please provide a reason.'], 400);
}

// ── Build display name ────────────────────────────────────────────────────
$stmt = db()->prepare(
    'SELECT * FROM members WHERE company_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
);
$stmt->execute([$company['id'], $fullName]);
$memberRow  = $stmt->fetch();
$englishName = $memberRow['english_name'] ?? '';
$displayName = $englishName ? "{$fullName} ({$englishName})" : $fullName;
$groupText   = $group ?: ($memberRow['group_name'] ?? 'ያልተጠቀሰ');

// ── Ethiopian date & time ─────────────────────────────────────────────────
$ethDate   = get_ethiopian_date($now);
$ethTime   = get_ethiopian_time($now);
$statusTxt = $status === 'present' ? 'ተገኝቷል / ተገኝታለች' : 'ፈቃድ ጠይቋል / ጠይቃለች';

// ── Save to MySQL ─────────────────────────────────────────────────────────
$stmt = db()->prepare(
    'INSERT INTO attendance_records
     (company_id, member_id, member_name, group_name, status, reason, latitude, longitude, eth_date, eth_time, is_admin_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    $company['id'],
    $memberRow['id'] ?? null,
    $displayName,
    $groupText,
    $status,
    $reason,
    $latitude,
    $longitude,
    $ethDate,
    $ethTime,
    $adminOverride ? 1 : 0,
]);

// ── Send Telegram notification ────────────────────────────────────────────
$botToken = $company['telegram_bot_token'] ?? '';
$chatId   = $company['telegram_chat_id']   ?? '';

if ($botToken && $chatId) {
    $caption = "🎼 *{$company['name']} — መገኘት መዝገብ*\n\n"
             . "👤 *ሙሉ ስም:*\u{2001}{$displayName}\n"
             . "📍 *ቡድን:*\u{2001}\u{2001}{$groupText}\n"
             . "📊 *ሁኔታ:*\u{2001}\u{2001}{$statusTxt}\n"
             . "📅 *ቀን:*\u{2001}\u{2001}\u{2001}{$ethDate}\n"
             . "⏰ *ሰዓት:*\u{2001}\u{2001}{$ethTime}";
    if ($status === 'permission' && $reason) {
        $caption .= "\n📝 *ምክንያት:*\u{2001}{$reason}";
    }

    $logoUrl = $company['logo_path']
        ? 'https://specificethiopian.com/uploads/logos/' . basename($company['logo_path'])
        : BASE_URL . '/assets/img/register-panel.jpg';

    $photoPayload = [
        'chat_id'    => $chatId,
        'photo'      => $logoUrl,
        'caption'    => $caption,
        'parse_mode' => 'Markdown',
    ];

    // Topic-specific thread
    if ($status === 'present' && $company['telegram_topic_present']) {
        $photoPayload['message_thread_id'] = (int)$company['telegram_topic_present'];
    } elseif ($status === 'permission' && $company['telegram_topic_permission']) {
        $photoPayload['message_thread_id'] = (int)$company['telegram_topic_permission'];
    }

    tg_send($botToken, 'sendPhoto', $photoPayload);
}

// ── Append to Google Sheets (optional) ───────────────────────────────────
if ($company['enable_google_sheets'] && $company['google_sheet_id'] && $company['google_service_account_json']) {
    $creds = parse_service_account($company['google_service_account_json']);
    if ($creds) {
        sheets_append($creds, $company['google_sheet_id'], 'Sheet1!A:E', [
            [$displayName, $groupText, $statusTxt, $ethDate, $ethTime],
        ]);
        // Also write to daily tab
        sheets_append($creds, $company['google_sheet_id'], "'{$ethDate}'!A:E", [
            [$displayName, $groupText, $statusTxt, $ethDate, $ethTime],
        ]);
    }
}

json_out(['success' => true, 'message' => 'መረጃዎ በተሳካ ሁኔታ ተመዝግቧል! / Attendance recorded successfully!']);
