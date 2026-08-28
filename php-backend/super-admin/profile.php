<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';

$admin = require_super_admin();
$flash = flash_get();
$pageTitle = 'My Profile';

if (is_post()) {
    $action = $_POST['action'] ?? '';

    if ($action === 'update_profile') {
        $username = trim($_POST['username'] ?? '');
        $current  = $_POST['current_password'] ?? '';
        $newPass  = $_POST['new_password'] ?? '';
        $confirm  = $_POST['confirm_password'] ?? '';

        if (!$username) {
            flash_set('error', 'Username is required.');
        } elseif (!$current || !password_verify($current, $admin['password_hash'])) {
            flash_set('error', 'Current password is incorrect.');
        } elseif ($newPass !== '' && strlen($newPass) < 6) {
            flash_set('error', 'New password must be at least 6 characters.');
        } elseif ($newPass !== '' && $newPass !== $confirm) {
            flash_set('error', 'New password and confirmation do not match.');
        } else {
            // Check username uniqueness (excluding self)
            $stmt = db()->prepare('SELECT id FROM super_admin WHERE username = ? AND id != ?');
            $stmt->execute([$username, $admin['id']]);
            if ($stmt->fetch()) {
                flash_set('error', 'That username is already taken.');
            } else {
                if ($newPass !== '') {
                    db()->prepare('UPDATE super_admin SET username = ?, password_hash = ? WHERE id = ?')
                        ->execute([$username, password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]), $admin['id']]);
                    flash_set('success', 'Profile updated. Please sign in again with the new password.');
                    logout_superadmin();
                    redirect(BASE_PATH . '/super-admin/login.php');
                } else {
                    db()->prepare('UPDATE super_admin SET username = ? WHERE id = ?')->execute([$username, $admin['id']]);
                    $_SESSION['super_admin_id'] = $admin['id'];
                    flash_set('success', 'Username updated.');
                    redirect('profile.php');
                }
            }
        }
        redirect('profile.php');
    }
}

$pageTitle = 'My Profile';
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
    <a href="settings.php" class="btn btn-secondary btn-sm">Settings</a>
    <a href="logout.php" class="btn btn-secondary btn-sm">Sign Out</a>
  </div>
</div>

<div style="padding:30px;max-width:800px;margin:0 auto">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card">
    <h2 class="card-title">Update Profile</h2>
    <p class="card-subtitle">Change your super admin username and/or password.</p>

    <form method="POST" style="margin-top:20px">
      <input type="hidden" name="action" value="update_profile">

      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" type="text" name="username" value="<?= e($admin['username']) ?>" required>
      </div>

      <div class="form-group">
        <label class="form-label">Current Password *</label>
        <input class="form-input" type="password" name="current_password" placeholder="Enter current password" required>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">New Password (optional)</label>
          <input class="form-input" type="password" name="new_password" placeholder="Leave empty to keep">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input class="form-input" type="password" name="confirm_password" placeholder="Repeat new password">
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Save Changes</button>
    </form>
  </div>
</div>

<div class="se-footer" style="text-align:center;padding:20px;font-size:13px;color:#9aa4b2;border-top:1px solid rgba(255,255,255,0.06)">
  Developed by <a href="https://specificethiopian.com" target="_blank" rel="noopener" style="color:#d97706;text-decoration:none">Specific Ethiopian</a> —
  Contact: <a href="https://t.me/xesser" target="_blank" rel="noopener" style="color:#229ED9;text-decoration:none">@xesser</a>
</div>
</body>
</html>