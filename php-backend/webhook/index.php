<?php
// ── Universal Telegram Webhook ────────────────────────────────────────────
// Handles ALL company bots via .htaccess rewrite:
//   /webhook/[slug]      → /webhook/index.php?c=[slug]
//   /webhook/[slug]?bot=admin → admin bot mode

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

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

// ── Student Bot Commands ──────────────────────────────────────────────────
function handle_student_command(string $token, $chatId, string $text, string $firstName, array $company): void {
    $appUrl = "https://global-attendace.vercel.app/?c={$company['slug']}";
    $name   = $company['name'];

    if (str_starts_with($text, '/start') || str_starts_with($text, '/help')) {
        $welcome = "ወደ *{$name} — መገኘት መዝገቢያ ቦት* እንኳን ደህና መጡ! 🎼\n\n"
                 . "ሰላም {$firstName} 👋\n\n"
                 . "በዚህ ቦት አማካኝነት የዕለቱ ትምህርት ክፍለ ጊዜ መገኘትዎን በቀላሉ መመዝገብ ይችላሉ።\n\n"
                 . "👇 *መገኘትዎን ለመመዝገብ ከታች ያለውን ቁልፍ ይጫኑ:*";
        tg_send($token, 'sendMessage', [
            'chat_id'      => $chatId,
            'text'         => $welcome,
            'parse_mode'   => 'Markdown',
            'reply_markup' => [
                'inline_keyboard' => [[
                    ['text' => '📝 መገኘት መዝግብ / Mark Attendance', 'web_app' => ['url' => $appUrl]],
                ]],
            ],
        ]);
    } else {
        tg_send($token, 'sendMessage', [
            'chat_id'      => $chatId,
            'text'         => "👋 ሰላም {$firstName}!\n\nመገኘትዎን ለመመዝገብ ከታች ያለውን ቁልፍ ይጫኑ። 👇",
            'parse_mode'   => 'Markdown',
            'reply_markup' => [
                'inline_keyboard' => [[
                    ['text' => '📝 መገኘት መዝግብ / Mark Attendance', 'web_app' => ['url' => $appUrl]],
                ]],
            ],
        ]);
    }
}

// ── Admin Bot Commands ────────────────────────────────────────────────────
function handle_admin_command(string $token, $chatId, string $text, string $firstName, array $company, array $message): void {
    $cmd = strtolower(explode(' ', $text)[0]);
    $cmd = preg_replace('/@\w+$/', '', $cmd); // strip @botname suffix

    switch ($cmd) {
        case '/start':
            tg_message($token, $chatId,
                "👋 ሰላም *{$firstName}*!\n\n"
                . "🛠 ወደ *{$company['name']} — አስተዳዳሪ ቦት* እንኳን ደህና መጡ!\n\n"
                . "ሁሉም ትዕዛዞች ለማየት /help ይጫኑ።"
            );
            break;
        case '/help':    cmd_help($token, $chatId); break;
        case '/today':   cmd_today($token, $chatId, $company); break;
        case '/present': cmd_present($token, $chatId, $company); break;
        case '/absent':  cmd_absent($token, $chatId, $company); break;
        case '/permission': cmd_permission($token, $chatId, $company); break;
        case '/stats':   cmd_stats($token, $chatId, $company); break;
        case '/search':
            $q = trim(substr($text, strlen('/search')));
            cmd_search($token, $chatId, $company, $q);
            break;
        case '/group':
            $parts = preg_split('/\s+/', $text);
            cmd_group($token, $chatId, $company, $parts[1] ?? '');
            break;
        case '/announce':
            $msg = trim(substr($text, strlen('/announce')));
            cmd_announce($token, $chatId, $company, $msg);
            break;
        case '/submit':
            $appUrl = "https://global-attendace.vercel.app/?c={$company['slug']}#admin";
            tg_send($token, 'sendMessage', [
                'chat_id'      => $chatId,
                'text'         => "📝 *አቴንዳንስ ለመመዝገብ (Admin Mode — ምንም ገደብ የለም):*",
                'parse_mode'   => 'Markdown',
                'reply_markup' => [
                    'inline_keyboard' => [[
                        ['text' => '📝 አቴንዳንስ መዝግብ (Admin)', 'web_app' => ['url' => $appUrl]],
                    ]],
                ],
            ]);
            break;
        default:
            tg_message($token, $chatId, "❓ ትዕዛዙ አልታወቀም። ሁሉም ትዕዛዞች ለማየት /help ይጫኑ። / Unknown command.");
    }
}

function cmd_help(string $token, $chatId): void {
    tg_message($token, $chatId,
        "🛠 *የአስተዳዳሪ ቦት ትዕዛዞች / Admin Commands*\n\n"
        . "/today — የዛሬ ሙሉ ማጠቃለያ / Full summary\n"
        . "/present — ዛሬ የተገኙ / Present list\n"
        . "/permission — ዛሬ ፈቃድ የጠየቁ / Permission list\n"
        . "/absent — ዛሬ የቀሩ / Absent list\n"
        . "/group 1 — ለቡድን ሁኔታ / Group status\n"
        . "/stats — ጠቅላላ ስታቲስቲክስ / Overall stats\n"
        . "/search ስም — የተማሪ ታሪክ / Member history\n"
        . "/announce መልዕክት — ለቻናሉ ላክ / Send announcement\n"
        . "/submit — አቴንዳንስ መዝግብ (Admin) / Submit attendance\n"
        . "/help — ይህን ዝርዝር አሳይ / Show this list"
    );
}

function get_today_records(array $company): array {
    require_once __DIR__ . '/../includes/ethiopian_date.php';
    $now     = eat_now();
    $ethDate = get_ethiopian_date($now);
    $stmt    = db()->prepare('SELECT * FROM attendance_records WHERE company_id = ? AND eth_date = ?');
    $stmt->execute([$company['id'], $ethDate]);
    return [$stmt->fetchAll(), $ethDate];
}

function get_members(array $company): array {
    $stmt = db()->prepare('SELECT * FROM members WHERE company_id = ? AND is_active = 1 ORDER BY group_name, name');
    $stmt->execute([$company['id']]);
    return $stmt->fetchAll();
}

function cmd_today(string $token, $chatId, array $company): void {
    [$records, $ethDate] = get_today_records($company);
    $members = get_members($company);
    $total   = count($members);

    $presentMap = $permMap = [];
    foreach ($records as $r) {
        $k = mb_strtolower(trim($r['member_name']));
        if ($r['status'] === 'present')    $presentMap[$k] = true;
        if ($r['status'] === 'permission') $permMap[$k]    = true;
    }

    $pCount = count($presentMap); $permCount = count($permMap);
    $aCount = $total - $pCount - $permCount;

    $msg = "📊 *{$company['name']} — {$ethDate}*\n"
         . "━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
         . "✅ ተገኙ: *{$pCount}/{$total}*\n"
         . "📝 ፈቃድ: *{$permCount}/{$total}*\n"
         . "❌ ቀሩ:  *{$aCount}/{$total}*\n\n";

    // Per-group breakdown
    $groups = array_unique(array_column($members, 'group_name'));
    foreach ($groups as $g) {
        $gm   = array_filter($members, fn($m) => $m['group_name'] === $g);
        $gp   = count(array_filter($gm, fn($m) => isset($presentMap[mb_strtolower(trim($m['name']))])));
        $gperm= count(array_filter($gm, fn($m) => isset($permMap[mb_strtolower(trim($m['name']))])));
        $ga   = count($gm) - $gp - $gperm;
        $msg .= "📌 *{$g}* — ✅{$gp} 📝{$gperm} ❌{$ga}\n";
    }
    tg_message($token, $chatId, $msg);
}

function cmd_present(string $token, $chatId, array $company): void {
    [$records, $ethDate] = get_today_records($company);
    $presentRows = array_filter($records, fn($r) => $r['status'] === 'present');
    $count = count($presentRows);
    $msg   = "✅ *ተገኙ — {$ethDate}* ({$count})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    if ($count === 0) { $msg .= "⚠️ ማንም አልተገኘም።"; }
    else { $i = 1; foreach ($presentRows as $r) { $msg .= ($i++) . ". {$r['member_name']} — {$r['group_name']}\n"; } }
    tg_message($token, $chatId, $msg);
}

function cmd_permission(string $token, $chatId, array $company): void {
    [$records, $ethDate] = get_today_records($company);
    $permRows = array_filter($records, fn($r) => $r['status'] === 'permission');
    $count = count($permRows);
    $msg   = "📝 *ፈቃድ — {$ethDate}* ({$count})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    if ($count === 0) { $msg .= "✅ ፈቃድ የጠየቀ የለም።"; }
    else { $i=1; foreach ($permRows as $r) { $msg .= ($i++) . ". {$r['member_name']} — {$r['group_name']}"; if ($r['reason']) $msg .= " | {$r['reason']}"; $msg .= "\n"; } }
    tg_message($token, $chatId, $msg);
}

function cmd_absent(string $token, $chatId, array $company): void {
    [$records, $ethDate] = get_today_records($company);
    $members = get_members($company);
    $submitted = array_map(fn($r) => mb_strtolower(trim($r['member_name'])), $records);
    // Match by first word of member_name (before the English part in parentheses)
    $submittedSimple = array_map(fn($n) => preg_replace('/\s*\(.*\)/', '', $n), $submitted);

    $absent = array_filter($members, function($m) use ($submittedSimple) {
        $key = mb_strtolower(trim($m['name']));
        return !in_array($key, $submittedSimple, true);
    });

    $total = count($members); $aCount = count($absent);
    $msg   = "❌ *ያልተገኙ — {$ethDate}* ({$aCount}/{$total})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    if ($aCount === 0) { $msg .= "🎉 ሁሉም ተመዝግበዋል!"; }
    else { $i=1; foreach ($absent as $m) { $n = $m['english_name'] ? "{$m['name']} ({$m['english_name']})" : $m['name']; $msg .= ($i++) . ". {$n} — {$m['group_name']}\n"; } }
    tg_message($token, $chatId, $msg);
}

function cmd_stats(string $token, $chatId, array $company): void {
    $stmt = db()->prepare('SELECT status, COUNT(*) as cnt FROM attendance_records WHERE company_id = ? GROUP BY status');
    $stmt->execute([$company['id']]);
    $rows = $stmt->fetchAll();

    $present = $perm = 0;
    foreach ($rows as $r) {
        if ($r['status'] === 'present')    $present = $r['cnt'];
        if ($r['status'] === 'permission') $perm    = $r['cnt'];
    }

    $stmt2 = db()->prepare('SELECT COUNT(DISTINCT eth_date) as days FROM attendance_records WHERE company_id = ?');
    $stmt2->execute([$company['id']]);
    $days = $stmt2->fetchColumn();

    $msg = "📊 *{$company['name']} — ጠቅላላ ስታቲስቲክስ*\n"
         . "━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
         . "📅 የተመዘገቡ ቀናት: *{$days}*\n"
         . "✅ ጠቅላላ ተገኙ: *{$present}*\n"
         . "📝 ጠቅላላ ፈቃድ: *{$perm}*\n"
         . "📋 ጠቅላላ: *" . ($present + $perm) . "*";
    tg_message($token, $chatId, $msg);
}

function cmd_search(string $token, $chatId, array $company, string $query): void {
    if (mb_strlen(trim($query)) < 2) { tg_message($token, $chatId, "❌ እባክዎ ስም ያስገቡ። ምሳሌ: /search ሀና"); return; }
    $like = '%' . $query . '%';
    $stmt = db()->prepare('SELECT * FROM attendance_records WHERE company_id = ? AND member_name LIKE ? ORDER BY submitted_at DESC LIMIT 30');
    $stmt->execute([$company['id'], $like]);
    $rows = $stmt->fetchAll();
    if (!$rows) { tg_message($token, $chatId, "🔍 ምንም ውጤት አልተገኘም — \"{$query}\""); return; }
    $msg = "🔍 *\"{$query}\" ምዝገባ ታሪክ* (" . count($rows) . ")\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    foreach ($rows as $r) {
        $icon = $r['status'] === 'present' ? '✅' : '📝';
        $msg .= "{$icon} {$r['eth_date']} — {$r['eth_time']}\n";
    }
    tg_message($token, $chatId, $msg);
}

function cmd_group(string $token, $chatId, array $company, string $num): void {
    $n       = (int)$num;
    $members = get_members($company);
    $groups  = array_values(array_unique(array_column($members, 'group_name')));
    if ($n < 1 || $n > count($groups)) {
        tg_message($token, $chatId, "❌ ቡድን ቁጥር (1-" . count($groups) . ") ያስገቡ። ምሳሌ: /group 1");
        return;
    }
    $group  = $groups[$n - 1];
    [$records, $ethDate] = get_today_records($company);
    $gMembers = array_filter($members, fn($m) => $m['group_name'] === $group);
    $presentMap = $permMap = [];
    foreach ($records as $r) {
        $k = mb_strtolower(trim($r['member_name']));
        if ($r['status'] === 'present')    $presentMap[$k] = true;
        if ($r['status'] === 'permission') $permMap[$k]    = true;
    }
    $present = $perm = $absent = [];
    foreach ($gMembers as $m) {
        $k = mb_strtolower(trim($m['name']));
        $n2 = $m['english_name'] ? "{$m['name']} ({$m['english_name']})" : $m['name'];
        if (isset($presentMap[$k]))    $present[] = $n2;
        elseif (isset($permMap[$k]))   $perm[]    = $n2;
        else                           $absent[]   = $n2;
    }
    $msg = "📌 *{$group} — {$ethDate}*\n"
         . "✅ " . count($present) . " 📝 " . count($perm) . " ❌ " . count($absent) . "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    if ($present)  { $msg .= "*✅ ተገኙ:*\n" . implode("\n", array_map(fn($v,$i)=>"  ".($i+1).". $v", $present, array_keys($present))) . "\n\n"; }
    if ($perm)     { $msg .= "*📝 ፈቃድ:*\n" . implode("\n", array_map(fn($v,$i)=>"  ".($i+1).". $v", $perm, array_keys($perm))) . "\n\n"; }
    if ($absent)   { $msg .= "*❌ ቀሩ:*\n"  . implode("\n", array_map(fn($v,$i)=>"  ".($i+1).". $v", $absent, array_keys($absent))); }
    tg_message($token, $chatId, $msg);
}

function cmd_announce(string $token, $chatId, array $company, string $msg): void {
    if (!$msg) { tg_message($token, $chatId, "❌ መልዕክት ያስገቡ። ምሳሌ: /announce ዛሬ ክፍለ ጊዜ ተሰርዟል"); return; }
    $studentChatId = $company['telegram_chat_id'] ?? '';
    $studentToken  = $company['telegram_bot_token'] ?? '';
    if (!$studentChatId || !$studentToken) { tg_message($token, $chatId, "❌ የተማሪ ቻናል አልተዋቀረም።"); return; }
    tg_message($studentToken, $studentChatId, "📢 *ከአስተዳዳሪ:*\n\n{$msg}");
    tg_message($token, $chatId, "✅ መልዕክቱ ለቻናሉ ተልኳል።");
}
