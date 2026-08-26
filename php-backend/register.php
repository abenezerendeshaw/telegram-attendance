<?php
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

start_session();
if (!empty($_SESSION['company_id'])) redirect(BASE_PATH . '/dashboard/');

$error = '';

if (is_post()) {
    $name     = trim($_POST['name'] ?? '');
    $username = trim(strtolower($_POST['username'] ?? ''));
    $email    = trim(strtolower($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['confirm_password'] ?? '';
    $type     = resolve_member_type($_POST['member_types'] ?? []);

    // Validation
    if (!$name || !$username || !$password) {
        $error = 'Name, username, and password are required. / ስም፣ የተጠቃሚ ስም እና የይለፍ ቃል አስፈላጊ ናቸው።';
    } elseif (!preg_match('/^[a-z0-9_-]{3,30}$/', $username)) {
        $error = 'Username must be 3–30 characters: lowercase letters, numbers, - or _ only. / የተጠቃሚ ስም ከ3–30 ቁምፊ ሊሆን ይገባዋል።';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters. / የይለፍ ቃል ቢያንስ 8 ቁምፊ ይሁን።';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match. / የይለፍ ቃሎቹ አይዛመዱም።';
    } else {
        $stmt = db()->prepare('SELECT id FROM companies WHERE username = ?');
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            $error = 'This username is already taken. Please choose another. / ይህ ስም ተወስዷል።';
        } else {
            $slug    = unique_slug($name);
            $hash    = hash_password($password);
            $cronSec = random_token(16);

            $db = db();
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'INSERT INTO companies (name, slug, username, email, password_hash, member_type)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([$name, $slug, $username, $email ?: null, $hash, $type]);
                $cid = $db->lastInsertId();

                $db->prepare(
                    'INSERT INTO company_settings (company_id, cron_secret, webapp_url) VALUES (?, ?, ?)'
                )->execute([$cid, $cronSec, 'https://global-attendace.vercel.app/?c=' . $slug]);

                $db->commit();
                $_SESSION['company_id']   = $cid;
                $_SESSION['company_slug'] = $slug;
                flash_set('success', '🎉 Welcome! Your organization is ready. Complete your profile below.');
                redirect(BASE_PATH . '/dashboard/');
            } catch (Exception $e) {
                $db->rollBack();
                $error = 'Registration failed. Please try again. (' . $e->getMessage() . ')';
            }
        }
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Register — Specific Ethiopian Attendance</title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/public.css">
</head>
<body class="split-page">
<div class="split-wrap">
  <div class="split-image" style="background-image: url('<?= BASE_PATH ?>/assets/img/register-panel.jpg')">
    <div class="split-overlay">
      <div class="split-brand">
        <span class="brand-flag">🇪🇹</span>
        <span class="brand-name">Specific Ethiopian</span>
        <span class="brand-tagline">Smart Attendance Management System</span>
      </div>
      <div class="split-testimonial">
        <div class="testimonial-text">"የእኛን ተማሪዎች መገኘት ከዚህ ቀደም በነበረው የተሻለ ሁኔታ እንድንቆጣጠር ረድቶናል"</div>
        <div class="testimonial-author">— የበገና የሙዚቃ ትምህርት ቤት</div>
      </div>
      <div class="split-stats">
        <div class="stat-item"><span class="stat-number">150+</span><span class="stat-label">Organizations</span></div>
        <div class="stat-item"><span class="stat-number">15K+</span><span class="stat-label">Members</span></div>
        <div class="stat-item"><span class="stat-number">99.9%</span><span class="stat-label">Uptime</span></div>
      </div>
    </div>
  </div>
  <div class="split-form">
    <div class="form-card">
      <div class="form-header">
        <h1 class="form-title">Create your account</h1>
        <p class="form-subtitle">ድርጅትዎን ይመዝግቡ / Register your organization</p>
      </div>

      <?php if ($error): ?><div class="alert alert-error">⚠️ <span><?= e($error) ?></span></div><?php endif; ?>

      <form method="POST" class="auth-form">

        <div class="form-group">
          <label class="form-label">Organization / School Name *</label>
          <input class="form-input" type="text" name="name" required
            placeholder="e.g. Begena Music School"
            value="<?= e($_POST['name'] ?? '') ?>">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Username *</label>
            <input class="form-input" type="text" name="username" required
              placeholder="e.g. begena_school"
              pattern="[a-z0-9_-]{3,30}"
              title="Lowercase letters, numbers, hyphens and underscores only (3–30 chars)"
              autocomplete="username"
              value="<?= e($_POST['username'] ?? '') ?>">
            <div class="form-hint">3–30 chars: lowercase, numbers, <code>-</code> <code>_</code></div>
          </div>
          <div class="form-group">
            <label class="form-label">Email (Optional)</label>
            <input class="form-input" type="email" name="email"
              placeholder="admin@yourschool.com"
              value="<?= e($_POST['email'] ?? '') ?>">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Member Type / አባላት አይነት</label>
          <div class="checkbox-grid">
            <label class="checkbox-card <?= in_array('student', $_POST['member_types'] ?? ['student']) ? 'checked' : '' ?>">
              <input type="checkbox" name="member_types[]" value="student"
                onchange="this.parentElement.classList.toggle('checked', this.checked)"
                <?= in_array('student', $_POST['member_types'] ?? ['student']) ? 'checked' : '' ?>>
              <span class="checkbox-icon">🎓</span>
              <span class="checkbox-label">Students / ተማሪዎች</span>
              <span class="checkbox-desc">For schools, colleges, universities</span>
            </label>
            <label class="checkbox-card <?= in_array('employee', $_POST['member_types'] ?? []) ? 'checked' : '' ?>">
              <input type="checkbox" name="member_types[]" value="employee"
                onchange="this.parentElement.classList.toggle('checked', this.checked)"
                <?= in_array('employee', $_POST['member_types'] ?? []) ? 'checked' : '' ?>>
              <span class="checkbox-icon">👔</span>
              <span class="checkbox-label">Employees / ሰራተኞች</span>
              <span class="checkbox-desc">For offices, factories, organizations</span>
            </label>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Password *</label>
            <input class="form-input" type="password" name="password" required
              placeholder="At least 8 characters"
              autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password *</label>
            <input class="form-input" type="password" name="confirm_password" required
              placeholder="Repeat your password"
              autocomplete="new-password">
          </div>
        </div>

        <button type="submit" class="btn-primary btn-lg">Create Organization →</button>
      </form>

      <div class="form-footer">
        Already registered? <a href="<?= BASE_PATH ?>/login.php">Sign In</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>