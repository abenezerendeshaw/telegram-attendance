<?php
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';

start_session();
if (!empty($_SESSION['company_id'])) redirect(BASE_PATH . '/dashboard/');

$error = '';
$msg = $_GET['err'] ?? '';
if ($msg === 'suspended') $error = 'Your account has been suspended. Please contact support. / አካውንትዎ ታግዷል።';

if (is_post()) {
    $username = trim($_POST['username'] ?? '');
    $pass     = $_POST['password'] ?? '';

    if (!$username || !$pass) {
        $error = 'Please enter your username and password. / ስምና የይለፍ ቃልዎን ያስገቡ።';
    } elseif (login_company($username, $pass)) {
        redirect(BASE_PATH . '/dashboard/');
    } else {
        $error = 'Invalid username or password. / የተሳሳተ ስም ወይም የይለፍ ቃል።';
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign In — Specific Ethiopian Attendance</title>
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
      <div class="split-features">
        <div class="feature-row"><span class="feature-icon">🤖</span><span>Your own Telegram bot per organization</span></div>
        <div class="feature-row"><span class="feature-icon">📍</span><span>GPS attendance verification</span></div>
        <div class="feature-row"><span class="feature-icon">📊</span><span>Daily automated reports</span></div>
        <div class="feature-row"><span class="feature-icon">🏢</span><span>Multi-branch & level support</span></div>
      </div>
    </div>
  </div>
  <div class="split-form">
    <div class="form-card">
      <div class="form-header">
        <h1 class="form-title">Welcome back 👋</h1>
        <p class="form-subtitle">Sign in to your organization / ወደ ድርጅትዎ ይግቡ</p>
      </div>

      <?php if ($error): ?><div class="alert alert-error">⚠️ <span><?= e($error) ?></span></div><?php endif; ?>

      <form method="POST" class="auth-form">
        <div class="form-group">
          <label class="form-label">Username / የተጠቃሚ ስም</label>
          <input class="form-input" type="text" name="username" required
            placeholder="your-username"
            autocomplete="username"
            value="<?= e($_POST['username'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="form-label">Password / የይለፍ ቃል</label>
          <input class="form-input" type="password" name="password" required
            placeholder="••••••••"
            autocomplete="current-password">
        </div>
        <button type="submit" class="btn-primary btn-lg">Sign In →</button>
      </form>

      <div class="form-footer">
        Don't have an account? <a href="<?= BASE_PATH ?>/register.php">Register your organization</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>