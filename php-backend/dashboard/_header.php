<?php
$companySlug = $company['slug'] ?? '';
$currentPath = basename($_SERVER['PHP_SELF']);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle ?? 'Dashboard') ?> — Specific Ethiopian</title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/dashboard.css">
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div style="display:flex;align-items:center;gap:12px">
        <?php if (!empty($company['logo_path'])): ?>
          <img src="<?= BASE_PATH ?>/uploads/logos/<?= e(basename($company['logo_path'])) ?>" alt="Logo">
        <?php else: ?>
          <div style="width:48px;height:48px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px">🏢</div>
        <?php endif; ?>
        <div>
          <div class="company-name"><?= e($company['name'] ?? 'Organization') ?></div>
          <div class="company-plan"><?= e($company['plan'] ?? 'Free') ?> Plan</div>
        </div>
      </div>
    </div>
    
    <nav class="sidebar-nav">
      <div class="nav-section-label">Main</div>
      <a href="index.php" class="nav-item <?= $currentPath === 'index.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Overview
      </a>
      <a href="members.php" class="nav-item <?= in_array($currentPath, ['members.php', 'members-import.php']) ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        Members List
      </a>
      <a href="branches.php" class="nav-item <?= $currentPath === 'branches.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Branches & Levels
      </a>
      <a href="attendance.php" class="nav-item <?= $currentPath === 'attendance.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        Attendance Log
      </a>
      <a href="receipts.php" class="nav-item <?= $currentPath === 'receipts.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>
        Receipts
      </a>
      
      <div class="nav-section-label" style="margin-top:16px">Configuration</div>
      <a href="settings.php" class="nav-item <?= $currentPath === 'settings.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Company Profile
      </a>
      <a href="password.php" class="nav-item <?= $currentPath === 'password.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Account & Password
      </a>
      <a href="bot-setup.php" class="nav-item <?= $currentPath === 'bot-setup.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 012 2c0 1.1-.9 2-2 2s-2-.9-2-2a2 2 0 012-2zm0 6c-3.3 0-6 2.7-6 6v8h12v-8c0-3.3-2.7-6-6-6z"/></svg>
        Telegram Bot
      </a>
      <a href="attendance-settings.php" class="nav-item <?= $currentPath === 'attendance-settings.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        Attendance Rules
      </a>
      <a href="integrations.php" class="nav-item <?= $currentPath === 'integrations.php' ? 'active' : '' ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Integrations
      </a>
    </nav>
    
    <div class="sidebar-footer">
      <a href="<?= BASE_PATH ?>/logout.php" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        Sign Out
      </a>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="topbar-title"><?= e($pageTitle ?? 'Dashboard') ?></div>
      <div class="topbar-actions">
        <?php if (!empty($company['telegram_bot_token'])): ?>
          <span class="badge badge-green">Bot Connected</span>
        <?php else: ?>
          <span class="badge badge-amber">Bot Not Setup</span>
        <?php endif; ?>
      </div>
    </div>
