<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Company Profile';

if (is_post()) {
    $name        = trim($_POST['name'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $color       = trim($_POST['primary_color'] ?? '#d97706');
    $mType       = in_array($_POST['member_type'] ?? '', ['student','employee']) ? $_POST['member_type'] : 'student';

    $logoPath  = $company['logo_path'];
    $coverPath = $company['cover_image'];

    // Handle logo upload
    if (!empty($_FILES['logo']['tmp_name'])) {
        $file = $_FILES['logo'];
        if ($file['size'] <= 2 * 1024 * 1024 && str_starts_with($file['type'], 'image/')) {
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
            $newName = $company['slug'] . '_logo_' . time() . '.' . $ext;
            $dest = __DIR__ . '/../uploads/logos/' . $newName;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                if ($logoPath && file_exists(__DIR__ . '/../uploads/logos/' . basename($logoPath))) {
                    @unlink(__DIR__ . '/../uploads/logos/' . basename($logoPath));
                }
                $logoPath = $newName;
            }
        } else {
            flash_set('error', 'Logo must be an image under 2MB.');
        }
    }

    // Handle cover upload
    if (!empty($_FILES['cover']['tmp_name'])) {
        $file = $_FILES['cover'];
        if ($file['size'] <= 5 * 1024 * 1024 && str_starts_with($file['type'], 'image/')) {
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
            $newName = $company['slug'] . '_cover_' . time() . '.' . $ext;
            $dest = __DIR__ . '/../uploads/covers/' . $newName;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                if ($coverPath && file_exists(__DIR__ . '/../uploads/covers/' . basename($coverPath))) {
                    @unlink(__DIR__ . '/../uploads/covers/' . basename($coverPath));
                }
                $coverPath = $newName;
            }
        }
    }

    if ($name) {
        $stmt = db()->prepare('UPDATE companies SET name = ?, description = ?, primary_color = ?, member_type = ?, logo_path = ?, cover_image = ? WHERE id = ?');
        $stmt->execute([$name, $description, $color, $mType, $logoPath, $coverPath, $company['id']]);
        flash_set('success', 'Profile updated successfully.');
        redirect('settings.php');
    }

    // ── Password change ─────────────────────────────────────────────────
    if (isset($_POST['change_password'])) {
        $current   = $_POST['current_password'] ?? '';
        $newPass   = $_POST['new_password'] ?? '';
        $confirm   = $_POST['confirm_password'] ?? '';
        $newEmail  = trim($_POST['email'] ?? $company['email']);
        $newUser   = trim(strtolower($_POST['username'] ?? $company['username']));

        // Validate username uniqueness (if changed)
        if ($newUser !== $company['username']) {
            if (!preg_match('/^[a-z0-9_-]{3,30}$/', $newUser)) {
                flash_set('error', 'Username must be 3–30 characters: lowercase letters, numbers, - or _ only.');
                redirect('settings.php#password');
            }
            $chk = db()->prepare('SELECT id FROM companies WHERE username = ? AND id != ? LIMIT 1');
            $chk->execute([$newUser, $company['id']]);
            if ($chk->fetch()) {
                flash_set('error', 'This username is already taken.');
                redirect('settings.php#password');
            }
        }

        if ($newPass !== '' || $newUser !== $company['username'] || $newEmail !== ($company['email'] ?? '')) {
            if (!password_verify($current, $company['password_hash'])) {
                flash_set('error', 'Current password is incorrect.');
                redirect('settings.php#password');
            }
            if ($newPass !== '') {
                if (strlen($newPass) < 8) {
                    flash_set('error', 'New password must be at least 8 characters.');
                    redirect('settings.php#password');
                }
                if ($newPass !== $confirm) {
                    flash_set('error', 'New passwords do not match.');
                    redirect('settings.php#password');
                }
            }

            $hash = $newPass !== '' ? hash_password($newPass) : $company['password_hash'];
            $stmt = db()->prepare('UPDATE companies SET password_hash = ?, username = ?, email = ? WHERE id = ?');
            $stmt->execute([$hash, $newUser, $newEmail ?: null, $company['id']]);
            $_SESSION['company_slug'] = $company['slug'];
            flash_set('success', 'Account settings updated successfully.');
            redirect('settings.php#password');
        }
    }
}
include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card" style="max-width:800px">
    <h2 class="card-title mb-4">Company Profile</h2>
    <form method="POST" enctype="multipart/form-data">
      
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Organization Name *</label>
          <input class="form-input" type="text" name="name" value="<?= e($company['name']) ?>" required>
        </div>
        
        <div class="form-group">
          <label class="form-label">Terminology (Students / Employees)</label>
          <select class="form-select" name="member_type">
            <option value="student" <?= $company['member_type'] === 'student' ? 'selected' : '' ?>>Students (ተማሪዎች)</option>
            <option value="employee" <?= $company['member_type'] === 'employee' ? 'selected' : '' ?>>Employees (ሰራተኞች)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Description (Shown on mini app)</label>
        <textarea class="form-textarea" name="description"><?= e($company['description']) ?></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Primary Brand Color</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="color" name="primary_color" value="<?= e($company['primary_color'] ?? '#d97706') ?>" style="width:50px;height:40px;padding:0;cursor:pointer;border-radius:8px">
          <span style="color:var(--text2);font-size:0.9rem">Used for buttons and highlights in your mini app</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Logo (Square recommended, max 2MB)</label>
          <?php if (!empty($company['logo_path'])): ?>
            <div style="margin-bottom:10px">
              <img src="<?= BASE_PATH ?>/uploads/logos/<?= e(basename($company['logo_path'])) ?>" alt="Logo" style="width:80px;height:80px;object-fit:cover;border-radius:12px;border:1px solid var(--border)">
            </div>
          <?php endif; ?>
          <input class="form-input" type="file" name="logo" accept="image/*">
        </div>
        
        <div class="form-group">
          <label class="form-label">Cover Image (Shown at top of app, max 5MB)</label>
          <?php if (!empty($company['cover_image'])): ?>
            <div style="margin-bottom:10px">
              <img src="<?= BASE_PATH ?>/uploads/covers/<?= e(basename($company['cover_image'])) ?>" alt="Cover" style="width:100%;height:80px;object-fit:cover;border-radius:12px;border:1px solid var(--border)">
            </div>
          <?php endif; ?>
          <input class="form-input" type="file" name="cover" accept="image/*">
        </div>
      </div>

      <div class="divider"></div>
      
      <button type="submit" class="btn btn-primary">Save Profile Settings</button>
    </form>
  </div>

  <div class="card" style="max-width:800px" id="password">
    <h2 class="card-title mb-4">Account & Password</h2>
    <form method="POST">
      <input type="hidden" name="change_password" value="1">

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Username (Login)</label>
          <input class="form-input" type="text" name="username" value="<?= e($company['username']) ?>" pattern="[a-z0-9_-]{3,30}" title="Lowercase letters, numbers, hyphens and underscores only (3–30 chars)">
        </div>
        <div class="form-group">
          <label class="form-label">Email Address (Optional)</label>
          <input class="form-input" type="email" name="email" value="<?= e($company['email'] ?? '') ?>">
        </div>
      </div>

      <div class="divider"></div>

      <div class="form-group">
        <label class="form-label">Current Password *</label>
        <input class="form-input" type="password" name="current_password" autocomplete="current-password">
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">New Password (min 8 chars)</label>
          <input class="form-input" type="password" name="new_password" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input class="form-input" type="password" name="confirm_password" autocomplete="new-password">
        </div>
      </div>
      <p style="color:var(--text2);font-size:0.85rem;margin:8px 0 16px">Leave new password fields empty to keep your current password. Current password is required to save username/email changes.</p>

      <button type="submit" class="btn btn-primary">Update Account & Password</button>
    </form>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
