<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Branches & Levels';

// ── Add Branch ─────────────────────────────────────────────────────────────
if (is_post() && ($_POST['action'] ?? '') === 'add_branch') {
    $name = trim($_POST['name'] ?? '');
    if ($name) {
        $stmt = db()->prepare('INSERT INTO branches (company_id, name) VALUES (?, ?)');
        $stmt->execute([$company['id'], $name]);
        flash_set('success', "Branch \"{$name}\" added.");
    } else {
        flash_set('error', 'Branch name is required.');
    }
    redirect('branches.php');
}

// ── Delete Branch ──────────────────────────────────────────────────────────
if (is_post() && ($_POST['action'] ?? '') === 'delete_branch') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id > 0) {
        db()->prepare('UPDATE members SET branch_id = NULL WHERE company_id = ? AND branch_id = ?')->execute([$company['id'], $id]);
        db()->prepare('DELETE FROM branches WHERE id = ? AND company_id = ?')->execute([$id, $company['id']]);
        flash_set('success', 'Branch deleted. Members in this branch were unassigned.');
    }
    redirect('branches.php');
}

// ── Add Level ──────────────────────────────────────────────────────────────
if (is_post() && ($_POST['action'] ?? '') === 'add_level') {
    $name = trim($_POST['name'] ?? '');
    if ($name) {
        $stmt = db()->prepare('INSERT INTO levels (company_id, name) VALUES (?, ?)');
        $stmt->execute([$company['id'], $name]);
        flash_set('success', "Level \"{$name}\" added.");
    } else {
        flash_set('error', 'Level name is required.');
    }
    redirect('branches.php');
}

// ── Delete Level ───────────────────────────────────────────────────────────
if (is_post() && ($_POST['action'] ?? '') === 'delete_level') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id > 0) {
        db()->prepare('UPDATE members SET level_id = NULL WHERE company_id = ? AND level_id = ?')->execute([$company['id'], $id]);
        db()->prepare('DELETE FROM levels WHERE id = ? AND company_id = ?')->execute([$id, $company['id']]);
        flash_set('success', 'Level deleted. Members in this level were unassigned.');
    }
    redirect('branches.php');
}

// ── Fetch existing ─────────────────────────────────────────────────────────
$stmt = db()->prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY name');
$stmt->execute([$company['id']]);
$branches = $stmt->fetchAll();

$stmt = db()->prepare('SELECT * FROM levels WHERE company_id = ? ORDER BY name');
$stmt->execute([$company['id']]);
$levels = $stmt->fetchAll();

// Count members per branch/level
$stmt = db()->prepare('SELECT branch_id, COUNT(*) as c FROM members WHERE company_id = ? GROUP BY branch_id');
$stmt->execute([$company['id']]);
$branchCounts = array_column($stmt->fetchAll(), 'c', 'branch_id');

$stmt = db()->prepare('SELECT level_id, COUNT(*) as c FROM members WHERE company_id = ? GROUP BY level_id');
$stmt->execute([$company['id']]);
$levelCounts = array_column($stmt->fetchAll(), 'c', 'level_id');

include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card-header">
    <div>
      <h2 class="card-title">Branches & Levels</h2>
      <p class="card-subtitle">Organize your <?= e($company['member_type']) ?>s into multiple branches (locations) and levels (grades/sections).</p>
    </div>
  </div>

  <div class="grid-2">
    <!-- Branches -->
    <div class="card">
      <h3 class="section-title">Branches / Locations</h3>
      <p class="section-sub">e.g. Addis Ababa, Bahir Dar, Main Campus</p>

      <form method="POST" style="display:flex;gap:10px;margin:16px 0">
        <input type="hidden" name="action" value="add_branch">
        <input class="form-input" type="text" name="name" placeholder="New branch name" required>
        <button type="submit" class="btn btn-primary" style="white-space:nowrap">+ Add</button>
      </form>

      <div style="display:flex;flex-direction:column;gap:8px">
        <?php if (empty($branches)): ?>
          <p style="color:var(--text3)">No branches yet. Add one above.</p>
        <?php endif; ?>
        <?php foreach ($branches as $b): ?>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:10px">
            <div>
              <span style="font-weight:600"><?= e($b['name']) ?></span>
              <span class="badge badge-gray" style="margin-left:8px"><?= (int)($branchCounts[$b['id']] ?? 0) ?> members</span>
            </div>
            <form method="POST" onsubmit="return confirm('Delete this branch? Members will be unassigned.')">
              <input type="hidden" name="action" value="delete_branch">
              <input type="hidden" name="id" value="<?= $b['id'] ?>">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        <?php endforeach; ?>
      </div>
    </div>

    <!-- Levels -->
    <div class="card">
      <h3 class="section-title">Levels / Grades / Sections</h3>
      <p class="section-sub">e.g. Level 1, Grade 9, Section A</p>

      <form method="POST" style="display:flex;gap:10px;margin:16px 0">
        <input type="hidden" name="action" value="add_level">
        <input class="form-input" type="text" name="name" placeholder="New level name" required>
        <button type="submit" class="btn btn-primary" style="white-space:nowrap">+ Add</button>
      </form>

      <div style="display:flex;flex-direction:column;gap:8px">
        <?php if (empty($levels)): ?>
          <p style="color:var(--text3)">No levels yet. Add one above.</p>
        <?php endif; ?>
        <?php foreach ($levels as $l): ?>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:10px">
            <div>
              <span style="font-weight:600"><?= e($l['name']) ?></span>
              <span class="badge badge-gray" style="margin-left:8px"><?= (int)($levelCounts[$l['id']] ?? 0) ?> members</span>
            </div>
            <form method="POST" onsubmit="return confirm('Delete this level? Members will be unassigned.')">
              <input type="hidden" name="action" value="delete_level">
              <input type="hidden" name="id" value="<?= $l['id'] ?>">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:20px">
    <h3 class="section-title">How it works</h3>
    <p style="color:var(--text2);line-height:1.7">
      After creating branches and levels here, assign each member to a branch and level on the
      <a href="members.php" style="color:var(--blue)">Members List</a> page.
      Attendance records will then show the branch and level for every submission.
    </p>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
