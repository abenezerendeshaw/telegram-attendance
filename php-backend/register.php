<?php
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';

start_session();
if (!empty($_SESSION['company_id'])) redirect('/dashboard/');

$error = '';
$success = '';

if (is_post()) {
    $name     = trim($_POST['name'] ?? '');
    $email    = trim(strtolower($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['confirm_password'] ?? '';
    $type     = in_array($_POST['member_type'] ?? '', ['student','employee']) ? $_POST['member_type'] : 'student';

    if (!$name || !$email || !$password) {
        $error = 'All fields are required. / ሁሉም መስኮች አስፈላጊ ናቸው።';
    } elseif (!valid_email($email)) {
        $error = 'Invalid email address. / ትክክለኛ ኢሜይል ያስገቡ።';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters. / የይለፍ ቃል ቢያንስ 8 ቁምፊ ይሁን።';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match. / የይለፍ ቃሎቹ አይዛመዱም።';
    } else {
        // Check email uniqueness
        $stmt = db()->prepare('SELECT id FROM companies WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            $error = 'This email is already registered. / ይህ ኢሜይል ተመዝግቧል።';
        } else {
            $slug     = unique_slug($name);
            $hash     = hash_password($password);
            $appUrl   = "https://telegram-attendance-dzbz.vercel.app/?c={$slug}";
            $cronSec  = random_token(16);

            $db = db();
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'INSERT INTO companies (name, slug, email, password_hash, member_type) VALUES (?, ?, ?, ?, ?)'
                );
                $stmt->execute([$name, $slug, $email, $hash, $type]);
                $cid = $db->lastInsertId();

                $db->prepare(
                    'INSERT INTO company_settings (company_id, cron_secret, webapp_url) VALUES (?, ?, ?)'
                )->execute([$cid, $cronSec, $appUrl]);

                $db->commit();
                $_SESSION['company_id']   = $cid;
                $_SESSION['company_slug'] = $slug;
                flash_set('success', '🎉 Welcome! Your organization is set up. Complete your profile below.');
                redirect('/dashboard/');
            } catch (Exception $e) {
                $db->rollBack();
                $error = 'Registration failed. Please try again. / ምዝገባ አልተሳካም።';
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
<link rel="stylesheet" href="/assets/css/public.css">
</head>
<body>
<div class="auth-wrap">
  <div class="auth-logo">
    <span class="site-name">🇪🇹 Specific Ethiopian</span>
    <span class="site-tagline">Attendance Management System</span>
  </div>
  <div class="auth-card">
    <h1 class="auth-title">Create your account</h1>
    <p class="auth-subtitle">ድርጅትዎን ይመዝግቡ / Register your organization</p>

    <?php if ($error): ?><div class="alert alert-error">⚠️ <?= e($error) ?></div><?php endif; ?>

    <form method="POST">
      <div class="form-group">
        <label class="form-label">Organization / School Name *</label>
        <input class="form-input" type="text" name="name" required
          placeholder="e.g. Begena Music School / የበገና ትምህርት ቤት"
          value="<?= e($_POST['name'] ?? '') ?>">
      </div>
      <div class="form-group">
        <label class="form-label">Email Address *</label>
        <input class="form-input" type="email" name="email" required
          placeholder="admin@yourschool.com"
          value="<?= e($_POST['email'] ?? '') ?>">
      </div>
      <div class="form-group">
        <label class="form-label">Member Type / አባላት አይነት</label>
        <select class="form-input" name="member_type">
          <option value="student"  <?= ($_POST['member_type'] ?? '') === 'student'  ? 'selected' : '' ?>>Students / ተማሪዎች</option>
          <option value="employee" <?= ($_POST['member_type'] ?? '') === 'employee' ? 'selected' : '' ?>>Employees / ሰራተኞች</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Password *</label>
        <input class="form-input" type="password" name="password" required
          placeholder="At least 8 characters">
      </div>
      <div class="form-group">
        <label class="form-label">Confirm Password *</label>
        <input class="form-input" type="password" name="confirm_password" required
          placeholder="Repeat your password">
      </div>
      <button type="submit" class="btn-primary">Create Organization →</button>
    </form>
  </div>
  <div class="auth-footer">
    Already registered? <a href="/login.php">Sign In</a>
  </div>
</div>
</body>
</html>
