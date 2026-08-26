<?php
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/db.php';
// Count companies for social proof
$stmt = db()->query('SELECT COUNT(*) FROM companies WHERE is_active = 1');
$count = $stmt->fetchColumn() ?: 0;
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Specific Ethiopian — Smart Telegram Attendance System</title>
<meta name="description" content="A powerful multi-tenant attendance management system for Ethiopian schools and organizations using Telegram bots.">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/public.css">
</head>
<body>
<div class="landing-wrap">
  <span class="landing-badge">🇪🇹 Made for Ethiopia</span>
  <h1 class="landing-title">Telegram Attendance<br>Made Simple</h1>
  <p class="landing-sub">
    ለትምህርት ቤቶችና ድርጅቶች — አስቀድሞ የተዘጋጀ Telegram ቦት፣ ዕለታዊ ሪፖርት፣ GPS ማረጋገጫ።
    <br>For schools &amp; organizations — instant Telegram bot, daily reports, GPS verification.
  </p>
  <div class="landing-cta">
    <a href="<?= BASE_PATH ?>/register.php" class="cta-primary">🚀 Register Your Organization</a>
    <a href="<?= BASE_PATH ?>/login.php"    class="cta-secondary">Sign In →</a>
  </div>

  <?php if ($count > 0): ?>
  <p style="margin-top:28px;font-size:0.82rem;color:var(--text2)">
    ✅ <?= $count ?> organization<?= $count > 1 ? 's' : '' ?> already using this system
  </p>
  <?php endif; ?>

  <div class="features-grid">
    <div class="feature-card">
      <span class="feature-icon">🤖</span>
      <div class="feature-title">Your Own Telegram Bot / የእርስዎ ቦት</div>
      <div class="feature-desc">One dedicated bot per organization with a unique webhook URL and branded mini app.</div>
    </div>
    <div class="feature-card">
      <span class="feature-icon">📍</span>
      <div class="feature-title">GPS Verification / ቦታ ማረጋገጫ</div>
      <div class="feature-desc">Verify that members are physically present at the class or office location.</div>
    </div>
    <div class="feature-card">
      <span class="feature-icon">📊</span>
      <div class="feature-title">Daily Reports / ዕለታዊ ሪፖርት</div>
      <div class="feature-desc">Automatic daily attendance summary sent to your Telegram channel with absent/present breakdown.</div>
    </div>
    <div class="feature-card">
      <span class="feature-icon">☁️</span>
      <div class="feature-title">Google Sheets Sync / ጉግል ሺት</div>
      <div class="feature-desc">Optionally sync all attendance data to your own Google Sheet for analysis and archiving.</div>
    </div>
    <div class="feature-card">
      <span class="feature-icon">👥</span>
      <div class="feature-title">Member Management / አባላት ያስተዳድሩ</div>
      <div class="feature-desc">Add, edit, group, and manage all students or employees from your dashboard.</div>
    </div>
    <div class="feature-card">
      <span class="feature-icon">⚙️</span>
      <div class="feature-title">Full Control / ሙሉ ቁጥጥር</div>
      <div class="feature-desc">Configure GPS radius, time windows, class days, and all settings from a beautiful dashboard.</div>
    </div>
  </div>
</div>
</body>
</html>
