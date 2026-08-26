<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';

$admin = require_super_admin();

// Fetch all companies
$stmt = db()->query('SELECT c.*, cs.webapp_url FROM companies c LEFT JOIN company_settings cs ON cs.company_id = c.id ORDER BY c.created_at DESC');
$companies = $stmt->fetchAll();

// Stats
$total = count($companies);
$active = count(array_filter($companies, fn($c) => $c['is_active'] == 1));
$suspended = $total - $active;

$pageTitle = 'Super Admin Dashboard';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?></title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/css/dashboard.css">
<style>
  .topbar { background: #1a1500; border-bottom: 1px solid #332b00; }
  .badge-pro { background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); }
</style>
</head>
<body style="background:#0f1117">

<div class="layout" style="display:block;min-height:100vh">
  
  <div class="topbar" style="padding:16px 30px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:1.2rem;font-weight:bold;color:#d97706">
      🔒 SAAS Super Admin
    </div>
    <div style="display:flex;gap:15px;align-items:center">
      <span style="color:#ccc;font-size:0.9rem">Welcome, <?= e($admin['username']) ?></span>
      <a href="logout.php" class="btn btn-secondary btn-sm">Sign Out</a>
    </div>
  </div>

  <div style="padding:30px;max-width:1200px;margin:0 auto">
    
    <div class="grid-3" style="margin-bottom:30px">
      <div class="stat-card">
        <div class="stat-value"><?= $total ?></div>
        <div class="stat-label">Total Organizations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--green)"><?= $active ?></div>
        <div class="stat-label">Active Accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--red)"><?= $suspended ?></div>
        <div class="stat-label">Suspended Accounts</div>
      </div>
    </div>

    <div class="card p-0">
      <div class="card-header" style="padding:20px;border-bottom:1px solid var(--border)">
        <h2 class="card-title">Registered Organizations</h2>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Organization</th>
              <th>Username</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($companies as $c): ?>
            <tr>
              <td style="color:#666">#<?= $c['id'] ?></td>
              <td>
                <div style="font-weight:600"><?= e($c['name']) ?></div>
                <div style="font-size:0.8rem;color:#888"><?= e($c['email'] ?: 'No email') ?></div>
              </td>
              <td style="font-family:monospace;color:#aaa">@<?= e($c['username']) ?></td>
              <td>
                <?php if ($c['plan'] === 'pro'): ?>
                  <span class="badge badge-pro">PRO</span>
                <?php else: ?>
                  <span class="badge badge-gray">Free</span>
                <?php endif; ?>
              </td>
              <td>
                <?php if ($c['is_active']): ?>
                  <span class="badge badge-green">Active</span>
                <?php else: ?>
                  <span class="badge badge-red">Suspended</span>
                <?php endif; ?>
              </td>
              <td style="font-size:0.85rem;color:#888">
                <?= date('M j, Y', strtotime($c['created_at'])) ?>
              </td>
              <td>
                <a href="company.php?id=<?= $c['id'] ?>" class="btn btn-secondary btn-sm">Manage</a>
              </td>
            </tr>
            <?php endforeach; if (!$companies): ?>
            <tr><td colspan="7" class="text-center" style="padding:40px;color:#888">No organizations registered yet.</td></tr>
            <?php endif; ?>
          </tbody>
        </table>
      </div>
    </div>
    
  </div>
</div>
</body>
</html>
