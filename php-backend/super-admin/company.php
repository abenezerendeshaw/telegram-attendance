<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';

$admin = require_super_admin();
$flash = flash_get();
$cid   = (int)($_GET['id'] ?? 0);

$stmt = db()->prepare('SELECT c.*, cs.* FROM companies c LEFT JOIN company_settings cs ON cs.company_id = c.id WHERE c.id = ?');
$stmt->execute([$cid]);
$c = $stmt->fetch();
if (!$c) die('Organization not found.');

if (is_post()) {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'toggle_status') {
        $newStatus = $c['is_active'] ? 0 : 1;
        db()->prepare('UPDATE companies SET is_active = ? WHERE id = ?')->execute([$newStatus, $cid]);
        flash_set('success', 'Organization status updated.');
        redirect('company.php?id=' . $cid);
    }
    
    if ($action === 'change_plan') {
        $newPlan = $_POST['plan'] === 'pro' ? 'pro' : 'free';
        db()->prepare('UPDATE companies SET plan = ? WHERE id = ?')->execute([$newPlan, $cid]);
        flash_set('success', 'Plan updated successfully.');
        redirect('company.php?id=' . $cid);
    }
}

$pageTitle = 'Manage: ' . $c['name'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?></title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/dashboard.css">
<style>
  .topbar { background: #1a1500; border-bottom: 1px solid #332b00; }
  .badge-pro { background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); }
</style>
</head>
<body style="background:#0f1117;min-height:100vh">

<div class="topbar" style="padding:16px 30px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:1.2rem;font-weight:bold;color:#d97706">
    <a href="index.php" style="color:#d97706;text-decoration:none">← SAAS Super Admin</a>
  </div>
</div>

<div style="padding:30px;max-width:1000px;margin:0 auto">
  <?php if ($flash): ?><div class="alert alert-<?= $flash['type'] ?>" style="margin-bottom:20px"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 class="card-title"><?= e($c['name']) ?></h2>
        <p class="card-subtitle">@<?= e($c['username']) ?> &nbsp;•&nbsp; <?= e($c['email'] ?: 'No email') ?></p>
      </div>
      <div>
        <?php if ($c['is_active']): ?>
          <span class="badge badge-green">Active</span>
        <?php else: ?>
          <span class="badge badge-red">Suspended</span>
        <?php endif; ?>
        <span class="badge <?= $c['plan'] === 'pro' ? 'badge-pro' : 'badge-gray' ?>"><?= strtoupper($c['plan']) ?></span>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <!-- Quick Actions -->
    <div class="card">
      <h3 class="section-title">Quick Actions</h3>
      
      <form method="POST" style="margin-top:20px;margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid var(--border)">
        <input type="hidden" name="action" value="toggle_status">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong><?= $c['is_active'] ? 'Suspend' : 'Activate' ?> Account</strong>
            <div style="font-size:0.8rem;color:#888">
              <?= $c['is_active'] ? 'Block login and bot access.' : 'Restore full access.' ?>
            </div>
          </div>
          <button type="submit" class="btn <?= $c['is_active'] ? 'btn-red' : 'btn-primary' ?>">
            <?= $c['is_active'] ? 'Suspend Account' : 'Activate Account' ?>
          </button>
        </div>
      </form>
      
      <form method="POST">
        <input type="hidden" name="action" value="change_plan">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>Billing Plan</strong>
            <div style="font-size:0.8rem;color:#888">Upgrade or downgrade features.</div>
          </div>
          <div style="display:flex;gap:10px">
            <select name="plan" class="form-input" style="width:120px">
              <option value="free" <?= $c['plan'] === 'free' ? 'selected' : '' ?>>Free</option>
              <option value="pro"  <?= $c['plan'] === 'pro'  ? 'selected' : '' ?>>Pro</option>
            </select>
            <button type="submit" class="btn btn-secondary">Save</button>
          </div>
        </div>
      </form>
    </div>

    <!-- Tech Specs -->
    <div class="card">
      <h3 class="section-title">Technical Details</h3>
      <div style="margin-top:20px;font-size:0.9rem;line-height:1.8">
        <div><strong style="color:#aaa;display:inline-block;width:120px">Company ID:</strong> <?= $c['id'] ?></div>
        <div><strong style="color:#aaa;display:inline-block;width:120px">URL Slug:</strong> <?= e($c['slug']) ?></div>
        <div><strong style="color:#aaa;display:inline-block;width:120px">Member Type:</strong> <?= e(member_type_label($c['member_type'] ?? 'student', true)) ?></div>
        <div><strong style="color:#aaa;display:inline-block;width:120px">Joined:</strong> <?= date('F j, Y', strtotime($c['created_at'])) ?></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <strong style="color:#aaa;display:inline-block;width:120px">Bot Token:</strong> 
          <span style="font-family:monospace;color:#8b5cf6">
            <?= $c['telegram_bot_token'] ? substr($c['telegram_bot_token'], 0, 15) . '...' : 'Not set' ?>
          </span>
        </div>
        <div>
          <strong style="color:#aaa;display:inline-block;width:120px">Webhook:</strong> 
          <a href="<?= BASE_URL ?>/webhook/<?= e($c['slug']) ?>" target="_blank" style="color:var(--blue)">Test Link ↗</a>
        </div>
      </div>
    </div>
  </div>

</div>
</body>
</html>
