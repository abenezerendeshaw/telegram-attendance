<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Account & Password';

if (is_post()) {
    try {
        $current   = $_POST['current_password'] ?? '';
        $newPass   = $_POST['new_password'] ?? '';
        $confirm   = $_POST['confirm_password'] ?? '';
        $newEmail  = trim($_POST['email'] ?? ($company['email'] ?? ''));
        $newUser   = trim(strtolower($_POST['username'] ?? ($company['username'] ?? '')));

        if (!$current) {
            flash_set('error', 'Current password is required to update account settings.');
            redirect('password.php');
        }

        if (!password_verify($current, $company['password_hash'])) {
            flash_set('error', 'Current password is incorrect.');
            redirect('password.php');
        }

        // Validate username uniqueness if changed
        if ($newUser !== ($company['username'] ?? '')) {
            if (!preg_match('/^[a-z0-9_-]{3,30}$/', $newUser)) {
                flash_set('error', 'Username must be 3–30 characters: lowercase letters, numbers, - or _ only.');
                redirect('password.php');
            }
            $chk = db()->prepare('SELECT id FROM companies WHERE username = ? AND id != ? LIMIT 1');
            $chk->execute([$newUser, $company['id']]);
            if ($chk->fetch()) {
                flash_set('error', 'This username is already taken.');
                redirect('password.php');
            }
        }

        // Validate new password if provided
        $hash = $company['password_hash'];
        if ($newPass !== '') {
            if (strlen($newPass) < 8) {
                flash_set('error', 'New password must be at least 8 characters.');
                redirect('password.php');
            }
            if ($newPass !== $confirm) {
                flash_set('error', 'New passwords do not match.');
                redirect('password.php');
            }
            $hash = hash_password($newPass);
        }

        $stmt = db()->prepare('UPDATE companies SET password_hash = ?, username = ?, email = ? WHERE id = ?');
        $stmt->execute([$hash, $newUser, $newEmail ?: null, $company['id']]);
        
        $_SESSION['company_slug'] = $company['slug'];
        flash_set('success', 'Account & password updated successfully.');
        redirect('password.php');
    } catch (Throwable $e) {
        flash_set('error', 'Failed to update account settings: ' . $e->getMessage());
    }
}

include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card" style="max-width:800px">
    <h2 class="card-title mb-4">Account & Password</h2>
    <form method="POST">
      
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Username (Login)</label>
          <input class="form-input" type="text" name="username" value="<?= e($company['username'] ?? '') ?>" required pattern="[a-z0-9_-]{3,30}" title="Lowercase letters, numbers, hyphens and underscores only (3–30 chars)">
        </div>
        <div class="form-group">
          <label class="form-label">Email Address (Optional)</label>
          <input class="form-input" type="email" name="email" value="<?= e($company['email'] ?? '') ?>">
        </div>
      </div>

      <div class="divider"></div>

      <div class="form-group">
        <label class="form-label">Current Password *</label>
        <input class="form-input" type="password" name="current_password" required autocomplete="current-password" placeholder="Enter current password to authorize changes">
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">New Password (min 8 chars)</label>
          <input class="form-input" type="password" name="new_password" autocomplete="new-password" placeholder="Leave empty to keep current">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input class="form-input" type="password" name="confirm_password" autocomplete="new-password" placeholder="Repeat new password">
        </div>
      </div>
      <p style="color:var(--text2);font-size:0.85rem;margin:8px 0 16px">Leave new password fields empty to keep your current password. Current password is required to save username or email changes.</p>

      <button type="submit" class="btn btn-primary">Update Account & Password</button>
    </form>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
