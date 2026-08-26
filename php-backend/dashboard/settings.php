<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Company Profile';

if (is_post()) {
    try {
        $name        = trim($_POST['name'] ?? '');
        $description = trim($_POST['description'] ?? '');
        $color       = trim($_POST['primary_color'] ?? '#d97706');
        $mType       = resolve_member_type($_POST['member_types'] ?? []);

        if (!$name) {
            flash_set('error', 'Organization Name is required.');
            redirect('settings.php');
        }

        $logoPath  = $company['logo_path'] ?? null;
        $coverPath = $company['cover_image'] ?? null;

        $validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

        // Handle logo upload
        if (!empty($_FILES['logo']['tmp_name'])) {
            $file  = $_FILES['logo'];
            $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg');
            $isImg = str_starts_with($file['type'] ?? '', 'image/') || in_array($ext, $validExts, true);
            if ($file['error'] === UPLOAD_ERR_OK && $file['size'] <= 2 * 1024 * 1024 && $isImg) {
                $newName = $company['slug'] . '_logo_' . time() . '.' . $ext;
                $destDir = __DIR__ . '/../uploads/logos/';
                if (!is_dir($destDir)) @mkdir($destDir, 0755, true);
                $dest = $destDir . $newName;
                if (move_uploaded_file($file['tmp_name'], $dest)) {
                    if ($logoPath && file_exists($destDir . basename($logoPath))) {
                        @unlink($destDir . basename($logoPath));
                    }
                    $logoPath = $newName;
                } else {
                    flash_set('error', 'Failed to save logo file to server. Please check folder permissions.');
                    redirect('settings.php');
                }
            } else {
                flash_set('error', 'Logo must be a valid image (JPG, PNG, WEBP) under 2MB.');
                redirect('settings.php');
            }
        }

        // Handle cover upload
        if (!empty($_FILES['cover']['tmp_name'])) {
            $file  = $_FILES['cover'];
            $ext   = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg');
            $isImg = str_starts_with($file['type'] ?? '', 'image/') || in_array($ext, $validExts, true);
            if ($file['error'] === UPLOAD_ERR_OK && $file['size'] <= 5 * 1024 * 1024 && $isImg) {
                $newName = $company['slug'] . '_cover_' . time() . '.' . $ext;
                $destDir = __DIR__ . '/../uploads/covers/';
                if (!is_dir($destDir)) @mkdir($destDir, 0755, true);
                $dest = $destDir . $newName;
                if (move_uploaded_file($file['tmp_name'], $dest)) {
                    if ($coverPath && file_exists($destDir . basename($coverPath))) {
                        @unlink($destDir . basename($coverPath));
                    }
                    $coverPath = $newName;
                } else {
                    flash_set('error', 'Failed to save cover image to server. Please check folder permissions.');
                    redirect('settings.php');
                }
            } else {
                flash_set('error', 'Cover image must be a valid image (JPG, PNG, WEBP) under 5MB.');
                redirect('settings.php');
            }
        }

        $stmt = db()->prepare('UPDATE companies SET name = ?, description = ?, primary_color = ?, member_type = ?, logo_path = ?, cover_image = ? WHERE id = ?');
        $stmt->execute([$name, $description ?: null, $color, $mType, $logoPath, $coverPath, $company['id']]);
        
        flash_set('success', 'Profile updated successfully.');
        redirect('settings.php');
    } catch (Throwable $e) {
        flash_set('error', 'Failed to update profile: ' . $e->getMessage());
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
          <input class="form-input" type="text" name="name" value="<?= e($company['name'] ?? '') ?>" required>
        </div>
        
        <div class="form-group">
          <label class="form-label">Member Type (can select both)</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:0.9rem">
              <input type="checkbox" name="member_types[]" value="student" style="accent-color:var(--accent)"
                <?= (($company['member_type'] ?? '') === 'student' || ($company['member_type'] ?? '') === 'both') ? 'checked' : '' ?>>
              🎓 Students / ተማሪዎች
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:0.9rem">
              <input type="checkbox" name="member_types[]" value="employee" style="accent-color:var(--accent)"
                <?= (($company['member_type'] ?? '') === 'employee' || ($company['member_type'] ?? '') === 'both') ? 'checked' : '' ?>>
              👔 Employees / ሰራተኞች
            </label>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Description (Shown on mini app)</label>
        <textarea class="form-textarea" name="description"><?= e($company['description'] ?? '') ?></textarea>
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
</div>

<?php include __DIR__ . '/_footer.php'; ?>
