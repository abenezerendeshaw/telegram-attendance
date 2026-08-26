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
    align-items: flex-end;
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
    max-width: 80%;
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
  }

  /* ----- Right Panel: Form perfectly centered with 1% inner margin ----- */
  .split-form {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1%;               /* 1% margin from all edges inside the container */
    background: var(--surface);
    overflow-y: auto;
  }

  .form-container {
    width: 100%;
    max-width: 440px;
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

  .form-hint {
    font-size: 0.75rem;
    color: var(--text2);
    margin-top: 4px;
    opacity: 0.75;
  }
  .form-hint code {
    background: var(--surface2);
    padding: 0 6px;
    border-radius: 4px;
    font-size: 0.7rem;
  }

  .form-row {
    display: flex;
    gap: 16px;
  }
  .form-row .form-group {
    flex: 1;
  }

  /* ----- Member Type Checkboxes (card style) ----- */
  .member-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .member-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .member-option:hover {
    border-color: var(--accent);
    background: rgba(217, 119, 6, 0.04);
  }

  .member-option.selected {
    border-color: var(--accent);
    background: rgba(217, 119, 6, 0.08);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .member-option input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }

  .member-option .icon {
    font-size: 1.6rem;
    line-height: 1;
  }

  .member-option .info {
    flex: 1;
  }

  .member-option .info .label {
    font-weight: 600;
    color: var(--text);
    display: block;
  }

  .member-option .info .desc {
    font-size: 0.85rem;
    color: var(--text2);
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

  /* ----- Responsive: keep the 1% padding on all screen sizes ----- */
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
    }

    .split-image .image-content .brand {
      font-size: 1.6rem;
    }

    .split-form {
      padding: 1%;            /* remains 1% on mobile */
      flex: none;
      width: 100%;
      min-height: 60vh;
    }

    .form-container {
      max-width: 100%;
    }

    .form-row {
      flex-direction: column;
      gap: 0;
    }
  }

  @media (max-width: 480px) {
    .split-image { min-height: 200px; padding: 24px 16px; }
    .split-form { padding: 1%; }
    .member-option { padding: 12px 14px; }
  }
</style>
</head>
<body>
<div class="split-container">

  <!-- Left: Image + Branding (50%) -->
  <div class="split-image" style="background-image: url('<?= BASE_PATH ?>/assets/img/register-panel.jpg')">
    <div class="image-content">
      <div class="brand">🇪🇹 <span>Specific</span> Attendance</div>
      <div class="tagline">Smart check‑in for schools &amp; workplaces</div>
      <div class="flag">ለኢትዮጵያ ተሰሪ</div>
    </div>
  </div>

  <!-- Right: Registration Form (50%) – now with 1% inner margin -->
  <div class="split-form">
    <div class="form-container">
      <h1>Get started</h1>
      <p class="subtitle">Create your organization account — it’s free.</p>

      <?php if ($error): ?>
        <div class="alert alert-error">⚠️ <?= e($error) ?></div>
      <?php endif; ?>

      <form method="POST" class="auth-form">

        <!-- Organization Name -->
        <div class="form-group">
          <label for="name">Organization / School Name *</label>
          <input class="form-input" type="text" id="name" name="name" required
                 placeholder="e.g. Begena Music School"
                 value="<?= e($_POST['name'] ?? '') ?>">
        </div>

        <!-- Username + Email row -->
        <div class="form-row">
          <div class="form-group">
            <label for="username">Username *</label>
            <input class="form-input" type="text" id="username" name="username" required
                   placeholder="e.g. begena_school"
                   pattern="[a-z0-9_-]{3,30}"
                   title="Lowercase letters, numbers, - or _ only (3–30 chars)"
                   autocomplete="username"
                   value="<?= e($_POST['username'] ?? '') ?>">
            <div class="form-hint">3–30 chars: lowercase, numbers, <code>-</code> <code>_</code></div>
          </div>
          <div class="form-group">
            <label for="email">Email (optional)</label>
            <input class="form-input" type="email" id="email" name="email"
                   placeholder="admin@yourschool.com"
                   value="<?= e($_POST['email'] ?? '') ?>">
          </div>
        </div>

        <!-- Member Types (checkboxes as cards) -->
        <div class="form-group">
          <label>Member Types (select one or both)</label>
          <div class="member-options">
            <label class="member-option <?= in_array('student', $_POST['member_types'] ?? ['student']) ? 'selected' : '' ?>">
              <input type="checkbox" name="member_types[]" value="student"
                     onchange="this.closest('.member-option').classList.toggle('selected', this.checked)"
                     <?= in_array('student', $_POST['member_types'] ?? ['student']) ? 'checked' : '' ?>>
              <span class="icon">🎓</span>
              <span class="info">
                <span class="label">Students / ተማሪዎች</span>
                <span class="desc">For schools, colleges, universities</span>
              </span>
            </label>
            <label class="member-option <?= in_array('employee', $_POST['member_types'] ?? []) ? 'selected' : '' ?>">
              <input type="checkbox" name="member_types[]" value="employee"
                     onchange="this.closest('.member-option').classList.toggle('selected', this.checked)"
                     <?= in_array('employee', $_POST['member_types'] ?? []) ? 'checked' : '' ?>>
              <span class="icon">👔</span>
              <span class="info">
                <span class="label">Employees / ሰራተኞች</span>
                <span class="desc">For offices, factories, organizations</span>
              </span>
            </label>
          </div>
        </div>

        <!-- Password & Confirm row -->
        <div class="form-row">
          <div class="form-group">
            <label for="password">Password *</label>
            <input class="form-input" type="password" id="password" name="password" required
                   placeholder="At least 8 characters"
                   autocomplete="new-password">
          </div>
          <div class="form-group">
            <label for="confirm_password">Confirm Password *</label>
            <input class="form-input" type="password" id="confirm_password" name="confirm_password" required
                   placeholder="Repeat your password"
                   autocomplete="new-password">
          </div>
        </div>

        <button type="submit" class="btn-primary">Create Organization →</button>
      </form>

      <div class="form-footer">
        Already have an account? <a href="<?= BASE_PATH ?>/login.php">Sign in</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>