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
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz@14..32&display=swap" rel="stylesheet">
<style>
  /* ----- Reset & Variables ----- */
  :root {
    --bg: #f8f6f2;
    --surface: #ffffff;
    --surface2: #f1efe9;
    --border: #e5e0d6;
    --border2: #d6cfc2;
    --text: #1e1b16;
    --text2: #5f5546;
    --accent: #d97706;
    --accent-hover: #b45309;
    --accent-glow: rgba(217, 119, 6, 0.25);
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    height: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    line-height: 1.5;
  }

  /* Full‑screen split container */
  .split-container {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--surface);
  }

  /* ----- Left Panel: Image + Branding ----- */
  .split-image {
    flex: 1;
    background-size: cover;
    background-position: center 25%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 48px 40px;
  }

  .split-image::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(145deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.60) 100%);
    z-index: 1;
  }

  .image-content {
    position: relative;
    z-index: 2;
    color: #fff;
  }

  .image-content .brand {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  .image-content .brand span {
    color: #fbbf24;
  }

  .image-content .tagline {
    font-size: 1.1rem;
    font-weight: 400;
    opacity: 0.92;
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .image-content .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 90%;
  }

  .image-content .feature-list li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .image-content .feature-list .icon {
    font-size: 1.2rem;
  }

  .image-content .flag {
    display: inline-block;
    margin-top: 14px;
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(4px);
    padding: 6px 20px;
    border-radius: 40px;
    border: 1px solid rgba(255,255,255,0.2);
    width: fit-content;
  }

  /* ----- Right Panel: Form perfectly centered with 1% inner padding ----- */
  .split-form {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1%;
    background: var(--surface);
    overflow-y: auto;
  }

  .form-container {
    width: 100%;
    max-width: 400px;
  }

  .form-container h1 {
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    margin-bottom: 6px;
  }

  .form-container .subtitle {
    font-size: 1rem;
    color: var(--text2);
    margin-bottom: 32px;
  }

  /* ----- Form Elements ----- */
  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text2);
    margin-bottom: 6px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .form-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    color: var(--text);
    font-size: 0.95rem;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }

  .form-input:focus {
    border-color: var(--accent);
    background: #fff;
    box-shadow: 0 0 0 4px var(--accent-glow);
    outline: none;
  }

  .form-input::placeholder {
    color: #b0a69a;
  }

  /* ----- Buttons & Alerts ----- */
  .btn-primary {
    width: 100%;
    padding: 15px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.25s ease;
    margin-top: 12px;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(217, 119, 6, 0.35);
  }

  .btn-primary:active {
    transform: translateY(0);
  }

  .form-footer {
    text-align: center;
    font-size: 0.9rem;
    color: var(--text2);
    margin-top: 24px;
  }

  .form-footer a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
    border-bottom: 1.5px solid transparent;
    transition: border-color 0.2s;
  }

  .form-footer a:hover {
    border-bottom-color: var(--accent);
  }

  /* Alert messages */
  .alert {
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 0.9rem;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-left: 4px solid transparent;
  }

  .alert-error {
    background: rgba(239, 68, 68, 0.08);
    border-left-color: #ef4444;
    color: #b91c1c;
  }

  .alert-success {
    background: rgba(34, 197, 94, 0.08);
    border-left-color: #22c55e;
    color: #15803d;
  }

  /* ----- Responsive: stack and keep 1% padding ----- */
  @media (max-width: 820px) {
    .split-container {
      flex-direction: column;
      height: auto;
      min-height: 100vh;
      overflow-y: auto;
    }

    .split-image {
      min-height: 280px;
      padding: 32px 24px;
      flex: none;
      width: 100%;
      justify-content: flex-end;
    }

    .split-image .image-content .brand {
      font-size: 1.6rem;
    }

    .split-form {
      padding: 1%;
      flex: none;
      width: 100%;
      min-height: 60vh;
    }

    .form-container {
      max-width: 100%;
    }
  }

  @media (max-width: 480px) {
    .split-image { min-height: 200px; padding: 24px 16px; }
    .split-form { padding: 1%; }
  }
</style>
</head>
<body>
<div class="split-container">

  <!-- Left: Image + Branding + Features -->
  <div class="split-image" style="background-image: url('<?= BASE_PATH ?>/assets/img/register-panel.jpg')">
    <div class="image-content">
      <div class="brand">🇪🇹 <span>Specific</span> Attendance</div>
      <div class="tagline">Smart check‑in for schools &amp; workplaces</div>
      <ul class="feature-list">
        <li><span class="icon">🤖</span> Your own Telegram bot per organization</li>
        <li><span class="icon">📍</span> GPS attendance verification</li>
        <li><span class="icon">📊</span> Daily automated reports</li>
        <li><span class="icon">🏢</span> Multi‑branch &amp; level support</li>
      </ul>
      <div class="flag">ለኢትዮጵያ ተሰሪ</div>
    </div>
  </div>

  <!-- Right: Login Form -->
  <div class="split-form">
    <div class="form-container">
      <h1>Welcome back 👋</h1>
      <p class="subtitle">Sign in to your organization / ወደ ድርጅትዎ ይግቡ</p>

      <?php if ($error): ?>
        <div class="alert alert-error">⚠️ <?= e($error) ?></div>
      <?php endif; ?>

      <form method="POST" class="auth-form">
        <div class="form-group">
          <label for="username">Username / የተጠቃሚ ስም</label>
          <input class="form-input" type="text" id="username" name="username" required
                 placeholder="your-username"
                 autocomplete="username"
                 value="<?= e($_POST['username'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label for="password">Password / የይለፍ ቃል</label>
          <input class="form-input" type="password" id="password" name="password" required
                 placeholder="••••••••"
                 autocomplete="current-password">
        </div>
        <button type="submit" class="btn-primary">Sign In →</button>
      </form>

      <div class="form-footer">
        Don't have an account? <a href="<?= BASE_PATH ?>/register.php">Register your organization</a>
      </div>
      <div class="se-footer" style="text-align:center;padding:16px 0;font-size:13px;color:#9aa4b2">
        Developed by <a href="https://specificethiopian.com" target="_blank" rel="noopener" style="color:#d97706;text-decoration:none">Specific Ethiopian</a> —
        Contact: <a href="https://t.me/xesser" target="_blank" rel="noopener" style="color:#229ED9;text-decoration:none">@xesser</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>