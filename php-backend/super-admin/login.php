<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';

start_session();
if (!empty($_SESSION['super_admin_id'])) {
    redirect(BASE_PATH . '/super-admin/index.php');
}

$error = '';
if (is_post()) {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    if (login_superadmin($username, $password)) {
        redirect(BASE_PATH . '/super-admin/index.php');
    } else {
        $error = 'Invalid super admin credentials.';
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Super Admin Login</title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/public.css">
<style>
  body { background: #0f1117; }
  .auth-wrap { align-items: center; justify-content: center; min-height: 100vh; display: flex; flex-direction: column; }
  .auth-card { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-top: 3px solid #d97706; padding: 40px; border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<div class="auth-wrap">
  <div class="auth-logo" style="margin-bottom:30px;text-align:center">
    <span class="site-name" style="color:#d97706;font-size:1.5rem">🔒 Super Admin Portal</span>
  </div>
  
  <div class="auth-card">
    <?php if ($error): ?><div class="alert alert-error" style="background:rgba(255,0,0,0.1);color:#ff6b6b;padding:10px;border-radius:6px;margin-bottom:20px;border:1px solid rgba(255,0,0,0.2)"><?= e($error) ?></div><?php endif; ?>
    
    <form method="POST">
      <div class="form-group" style="margin-bottom:20px">
        <label style="display:block;margin-bottom:8px;color:#ccc;font-size:0.9rem">Admin Username</label>
        <input type="text" name="username" required autofocus
               style="width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:8px">
      </div>
      
      <div class="form-group" style="margin-bottom:25px">
        <label style="display:block;margin-bottom:8px;color:#ccc;font-size:0.9rem">Password</label>
        <input type="password" name="password" required
               style="width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:8px">
      </div>
      
      <button type="submit" style="width:100%;padding:14px;background:#d97706;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:1rem">
        Access Portal →
      </button>
    </form>
  </div>
</div>
</body>
</html>
