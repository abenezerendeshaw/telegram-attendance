<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';

$admin = require_super_admin();
$flash = flash_get();
$pageTitle = 'System Settings';

if (is_post()) {
    $action = $_POST['action'] ?? '';

    if ($action === 'save_bot_token') {
        $token = trim($_POST['default_bot_token'] ?? '');
        set_system_config('default_bot_token', $token);
        flash_set('success', 'Default bot token saved.');
        redirect('settings.php');
    }
}

$currentToken = get_default_bot_token();
$pageTitle = 'System Settings';
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
</style>
</head>
<body style="background:#0f1117">

<div class="topbar" style="padding:16px 30px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:1.2rem;font-weight:bold;color:#d97706">
    <a href="index.php" style="color:#d97706;text-decoration:none">← SAAS Super Admin</a>
  </div>
  <div style="display:flex;gap:15px;align-items:center">
    <span style="color:#ccc;font-size:0.9rem"><?= e($admin['username']) ?></span>
    <a href="profile.php" class="btn btn-secondary btn-sm">Profile</a>
    <a href="logout.php" class="btn btn-secondary btn-sm">Sign Out</a>
  </div>
</div>

<div style="padding:30px;max-width:800px;margin:0 auto">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card">
    <h2 class="card-title">Default Telegram Bot Token</h2>
    <p class="card-subtitle">This token is used by all companies that have not set their own bot token. Leave empty to disable the shared bot.</p>

    <form method="POST" style="margin-top:20px">
      <input type="hidden" name="action" value="save_bot_token">
      <div class="form-group">
        <label class="form-label">Default Bot Token (from @BotFather)</label>
        <input class="form-input" type="text" name="default_bot_token" value="<?= e($currentToken) ?>" placeholder="123456789:ABCdefGHIjklMNOpqr...">
      </div>
      <button type="submit" class="btn btn-primary">Save Token</button>
    </form>
  </div>
</div>

<div class="se-footer" style="text-align:center;padding:20px;font-size:13px;color:#9aa4b2;border-top:1px solid rgba(255,255,255,0.06)">
  Developed by <a href="https://specificethiopian.com" target="_blank" rel="noopener" style="color:#d97706;text-decoration:none">Specific Ethiopian</a> —
  Contact: <a href="https://t.me/xesser" target="_blank" rel="noopener" style="color:#229ED9;text-decoration:none">@xesser</a>
</div>
</body>
</html>