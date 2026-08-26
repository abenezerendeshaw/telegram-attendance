<?php
// ── POST /api/cron.php ────────────────────────────────────────────────────
// Sends daily attendance summary to all active companies.
// Called by cPanel cron job: curl -X POST https://specificethiopian.com/api/cron.php \
//   -H "Authorization: Bearer {global_cron_secret}"
// OR per-company: ?c=[slug]&secret=[company_cron_secret]

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telegram.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

// Global cron secret (set this in a PHP config or .htaccess env)
define('GLOBAL_CRON_SECRET', getenv('CRON_SECRET') ?: 'change_me_global_cron_secret');

// ── Auth ──────────────────────────────────────────────────────────────────
$auth   = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token  = str_replace('Bearer ', '', $auth);
$cSlug  = param('c');
$cSecret= param('secret');

$isGlobal   = hash_equals(GLOBAL_CRON_SECRET, $token);
$isSingle   = false;
$companies  = [];

if ($isGlobal) {
    // Run for all active companies
    $stmt = db()->query(
        'SELECT c.*, cs.* FROM companies c
         LEFT JOIN company_settings cs ON cs.company_id = c.id
         WHERE c.is_active = 1 AND cs.enable_cron = 1'
    );
    $companies = $stmt->fetchAll();
} elseif ($cSlug && $cSecret) {
    $company = get_company_by_slug($cSlug);
    if ($company && hash_equals($company['cron_secret'] ?? '', $cSecret)) {
        $companies = [$company];
        $isSingle  = true;
    } else {
        json_out(['error' => 'Invalid secret'], 403);
    }
} else {
    json_out(['error' => 'Unauthorized'], 401);
}

// ── Run report for each company ───────────────────────────────────────────
$results = [];
foreach ($companies as $company) {
    $result = run_daily_report($company);
    $results[] = ['company' => $company['slug'], ...$result];
}

json_out(['ok' => true, 'processed' => count($results), 'results' => $results]);

// ── Report generator ──────────────────────────────────────────────────────
function run_daily_report(array $company): array {
    $now     = eat_now();
    $ethDate = get_ethiopian_date($now);

    // Get today's attendance from MySQL
    $stmt = db()->prepare(
        'SELECT * FROM attendance_records
         WHERE company_id = ? AND eth_date = ?'
    );
    $stmt->execute([$company['id'], $ethDate]);
    $records = $stmt->fetchAll();

    // Get all active members
    $stmt = db()->prepare(
        'SELECT m.*, b.name AS branch_name, l.name AS level_name
         FROM members m
         LEFT JOIN branches b ON b.id = m.branch_id
         LEFT JOIN levels l ON l.id = m.level_id
         WHERE m.company_id = ? AND m.is_active = 1'
    );
    $stmt->execute([$company['id']]);
    $members = $stmt->fetchAll();
    $total   = count($members);

    // Build sets
    $presentNames   = [];
    $permissionNames= [];
    foreach ($records as $r) {
        $key = mb_strtolower(trim($r['member_name']));
        if ($r['status'] === 'present')    $presentNames[$key]    = true;
        if ($r['status'] === 'permission') $permissionNames[$key] = true;
    }

    $presentCount    = count($presentNames);
    $permissionCount = count($permissionNames);
    $absentCount     = $total - $presentCount - $permissionCount;

    // Absent list
    $absentList = [];
    foreach ($members as $m) {
        $key = mb_strtolower(trim($m['name']));
        if (!isset($presentNames[$key]) && !isset($permissionNames[$key])) {
            $label = $m['english_name'] ? "{$m['name']} ({$m['english_name']})" : $m['name'];
            $absentList[] = $label . ' — ' . ($m['group_name'] ?? '')
                . ($m['branch_name'] ? " | 🏢 {$m['branch_name']}" : '')
                . ($m['level_name'] ? " | 🎓 {$m['level_name']}" : '');
        }
    }

    // Build report message
    $companyName = $company['name'];
    $msg = "📊 *{$companyName} — የዕለት ሪፖርት*\n"
         . "📅 *{$ethDate}*\n"
         . "━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
         . "✅ ተገኙ: *{$presentCount}/{$total}*\n"
         . "📝 ፈቃድ: *{$permissionCount}/{$total}*\n"
         . "❌ ቀሩ:  *{$absentCount}/{$total}*\n\n";

    if (!empty($absentList)) {
        $msg .= "❌ *ያልተገኙ:*\n";
        foreach ($absentList as $i => $name) {
            $msg .= (($i + 1) . ". {$name}\n");
        }
    } else {
        $msg .= "🎉 ሁሉም ተመዝግበዋል!\n";
    }

    // Send to Telegram
    $botToken = $company['telegram_bot_token'] ?? '';
    $chatId   = $company['telegram_chat_id']   ?? '';

    if ($botToken && $chatId) {
        $extra = [];
        if ($company['telegram_topic_absent']) {
            $extra['message_thread_id'] = (int)$company['telegram_topic_absent'];
        }
        tg_message($botToken, $chatId, $msg, $extra);

        // Also send present list to present topic if configured
        if ($company['telegram_topic_present'] && $presentCount > 0) {
            $presentMsg = "✅ *{$companyName} — ተገኙ ({$ethDate})* ({$presentCount})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
            $i = 1;
            foreach ($records as $r) {
                if ($r['status'] === 'present') {
                    $presentMsg .= "{$i}. {$r['member_name']} — {$r['group_name']}\n";
                    $i++;
                }
            }
            tg_message($botToken, $chatId, $presentMsg, ['message_thread_id' => (int)$company['telegram_topic_present']]);
        }
    }

    return [
        'present'    => $presentCount,
        'permission' => $permissionCount,
        'absent'     => $absentCount,
        'total'      => $total,
    ];
}
