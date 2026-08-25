<?php
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';

start_session();
if (!empty($_SESSION['company_id'])) redirect('/dashboard/');

$error = '';
$msg = $_GET['err'] ?? '';
if ($msg === 'suspended') $error = 'Your account has been suspended. Please contact support. / አካውንትዎ ታግዷል።';

if (is_post()) {
    $email = trim($_POST['email'] ?? '');
    $pass  = $_POST['password'] ?? '';
    
    if (!$email || !$pass) {
        $error = 'Please enter email and password. / እባክዎ ኢሜይል እና የይለፍ ቃል ያስገቡ።';
    } elseif (login_company($email, $pass)) {
        redirect('/dashboard/');
    } else {
        $error = 'Invalid email or password. / የተሳሳተ ኢሜይል ወይም የይለፍ ቃል';
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign In — Specific Ethiopian Attendance</title>
<link rel="stylesheet" href="/assets/css/public.css">
</head>
<body>
<div class="auth-wrap">
  <div class="auth-logo">
    <span class="site-name">🇪🇹 Specific Ethiopian</span>
  </div>
  <div class="auth-card">
    <h1 class="auth-title">Welcome back</h1>
    <p class="auth-subtitle">Sign in to your organization / ወደ ድርጅትዎ ይግቡ</p>

    <?php if ($error): ?><div class="alert alert-error">⚠️ <?= e($error) ?></div><?php endif; ?>

    <form method="POST">
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input class="form-input" type="email" name="email" required 
          placeholder="admin@yourschool.com"
          value="<?= e($_POST['email'] ?? '') ?>">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" name="password" required 
          placeholder="••••••••">
      </div>
      <button type="submit" class="btn-primary">Sign In →</button>
    </form>
  </div>
  <div class="auth-footer">
    Don't have an account? <a href="/register.php">Register</a>
  </div>
</div>
</body>
</html>
