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
</div>

<?php include __DIR__ . '/_footer.php'; ?>
