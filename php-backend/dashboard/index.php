<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

$company = require_auth();
$flash   = flash_get();
$today   = get_ethiopian_date(eat_now());

// ── Stats ─────────────────────────────────────────────────────────────────
// Members count
$stmt = db()->prepare('SELECT COUNT(*) FROM members WHERE company_id = ? AND is_active = 1');
$stmt->execute([$company['id']]);
$totalMembers = $stmt->fetchColumn() ?: 0;

// Today's submissions
$stmt = db()->prepare('SELECT status, COUNT(*) as c FROM attendance_records WHERE company_id = ? AND eth_date = ? GROUP BY status');
$stmt->execute([$company['id'], $today]);
$todayRows = $stmt->fetchAll();

$presentToday = $permToday = 0;
foreach ($todayRows as $r) {
    if ($r['status'] === 'present')    $presentToday = $r['c'];
    if ($r['status'] === 'permission') $permToday    = $r['c'];
}
$absentToday = max(0, $totalMembers - $presentToday - $permToday);

// Recent activity
$stmt = db()->prepare('SELECT member_name, group_name, status, eth_date, eth_time FROM attendance_records WHERE company_id = ? ORDER BY submitted_at DESC LIMIT 5');
$stmt->execute([$company['id']]);
$recent = $stmt->fetchAll();

$pageTitle = 'Dashboard Overview';
include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Overview / አጠቃላይ እይታ</h2>
      <p class="card-subtitle">Today: <strong><?= e($today) ?></strong></p>
    </div>
    <div class="topbar-actions">
      <a href="<?= e($company['webapp_url'] ?? '#') ?>" target="_blank" class="btn btn-secondary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        Open Mini App
      </a>
    </div>
  </div>

  <?php if ($flash): ?>
    <div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div>
  <?php endif; ?>

  <?php if (empty($company['telegram_bot_token'])): ?>
    <div class="alert alert-warning">
      <strong>⚠️ Action Required:</strong> You haven't configured your Telegram bot yet. 
      <a href="bot-setup.php" style="color:inherit;text-decoration:underline">Set it up now →</a>
    </div>
  <?php endif; ?>

  <div class="stats-grid">
    <div class="stat-card blue">
      <span class="stat-icon">👥</span>
      <div class="stat-value"><?= $totalMembers ?></div>
      <div class="stat-label">Total <?= e($company['member_type']) ?>s<br>ጠቅላላ ተማሪዎች</div>
    </div>
    <div class="stat-card green">
      <span class="stat-icon">✅</span>
      <div class="stat-value"><?= $presentToday ?></div>
      <div class="stat-label">Present Today<br>ዛሬ የተገኙ</div>
    </div>
    <div class="stat-card amber">
      <span class="stat-icon">📝</span>
      <div class="stat-value"><?= $permToday ?></div>
      <div class="stat-label">Permission Today<br>ዛሬ ፈቃድ</div>
    </div>
    <div class="stat-card red">
      <span class="stat-icon">❌</span>
      <div class="stat-value"><?= $absentToday ?></div>
      <div class="stat-label">Absent Today<br>ዛሬ የቀሩ</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3 class="section-title">Recent Activity / የቅርብ ጊዜ እንቅስቃሴ</h3>
      <div class="table-wrap" style="margin-top:16px;">
        <table>
          <thead><tr><th>Name</th><th>Group</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            <?php foreach ($recent as $r): ?>
            <tr>
              <td><?= e($r['member_name']) ?></td>
              <td><?= e($r['group_name'] ?: '—') ?></td>
              <td>
                <span class="badge badge-<?= $r['status'] === 'present' ? 'green' : 'amber' ?>">
                  <?= $r['status'] === 'present' ? '✅ Present' : '📝 Permission' ?>
                </span>
              </td>
              <td style="color:var(--text2);font-size:0.8rem"><?= e($r['eth_date'] . ' ' . $r['eth_time']) ?></td>
            </tr>
            <?php endforeach; if (empty($recent)): ?>
            <tr><td colspan="4" class="text-center" style="color:var(--text3)">No recent activity</td></tr>
            <?php endif; ?>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Quick Links</h3>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
        <a href="members.php" class="btn btn-secondary w-full" style="justify-content:flex-start">
          <span>👥</span> Manage Members (Add / Edit)
        </a>
        <a href="attendance.php" class="btn btn-secondary w-full" style="justify-content:flex-start">
          <span>📊</span> View Full Attendance Log
        </a>
        <a href="attendance-settings.php" class="btn btn-secondary w-full" style="justify-content:flex-start">
          <span>⚙️</span> Configure GPS & Time Windows
        </a>
        <a href="bot-setup.php" class="btn btn-secondary w-full" style="justify-content:flex-start">
          <span>🤖</span> Telegram Bot Settings
        </a>
      </div>
    </div>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
