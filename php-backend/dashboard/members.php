<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Members List';

// Handle Add/Edit
if (is_post() && isset($_POST['action']) && $_POST['action'] === 'save') {
    $id      = (int)($_POST['id'] ?? 0);
    $name    = trim($_POST['name'] ?? '');
    $ename   = trim($_POST['english_name'] ?? '');
    $group   = trim($_POST['group_name'] ?? '');
    $branch  = (int)($_POST['branch_id'] ?? 0);
    $level   = (int)($_POST['level_id'] ?? 0);
    $active  = isset($_POST['is_active']) ? 1 : 0;
    
    if ($name) {
        if ($id > 0) {
            $stmt = db()->prepare('UPDATE members SET name = ?, english_name = ?, group_name = ?, branch_id = ?, level_id = ?, is_active = ? WHERE id = ? AND company_id = ?');
            $stmt->execute([$name, $ename, $group, $branch ?: null, $level ?: null, $active, $id, $company['id']]);
            flash_set('success', 'Member updated successfully.');
        } else {
            $stmt = db()->prepare('INSERT INTO members (company_id, name, english_name, group_name, branch_id, level_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$company['id'], $name, $ename, $group, $branch ?: null, $level ?: null, $active]);
            flash_set('success', 'New member added successfully.');
        }
    }
    redirect('members.php');
}

// Handle Delete
if (is_post() && isset($_POST['action']) && $_POST['action'] === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id > 0) {
        $stmt = db()->prepare('DELETE FROM members WHERE id = ? AND company_id = ?');
        $stmt->execute([$id, $company['id']]);
        flash_set('success', 'Member deleted.');
    }
    redirect('members.php');
}

// Fetch all members
$stmt = db()->prepare(
    'SELECT m.*, b.name AS branch_name, l.name AS level_name
     FROM members m
     LEFT JOIN branches b ON b.id = m.branch_id
     LEFT JOIN levels l ON l.id = m.level_id
     WHERE m.company_id = ? ORDER BY m.group_name, m.name'
);
$stmt->execute([$company['id']]);
$members = $stmt->fetchAll();

// Fetch branches & levels for the modal dropdowns
$stmt = db()->prepare('SELECT id, name FROM branches WHERE company_id = ? ORDER BY name');
$stmt->execute([$company['id']]);
$branches = $stmt->fetchAll();

$stmt = db()->prepare('SELECT id, name FROM levels WHERE company_id = ? ORDER BY name');
$stmt->execute([$company['id']]);
$levels = $stmt->fetchAll();

include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Manage Members</h2>
      <p class="card-subtitle">Add or edit your <?= e(member_type_label($company['member_type'] ?? 'student', true)) ?>s list</p>
    </div>
    <div class="topbar-actions">
      <!-- We could link to members-import.php for CSV bulk upload here -->
      <button class="btn btn-primary" onclick="openModal()">+ Add New Member</button>
    </div>
  </div>

  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card p-0">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Primary Name (Amharic)</th>
            <th>English Name</th>
            <th>Group / Class</th>
            <th>Branch</th>
            <th>Level</th>
            <th>Status</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($members as $m): ?>
          <tr>
            <td style="font-weight:600"><?= e($m['name']) ?></td>
            <td><?= e($m['english_name']) ?></td>
            <td>
              <?php if ($m['group_name']): ?>
                <span class="badge badge-gray"><?= e($m['group_name']) ?></span>
              <?php else: ?>
                —
              <?php endif; ?>
            </td>
            <td>
              <?php if ($m['branch_name']): ?>
                <span class="badge badge-blue"><?= e($m['branch_name']) ?></span>
              <?php else: ?>
                —
              <?php endif; ?>
            </td>
            <td>
              <?php if ($m['level_name']): ?>
                <span class="badge badge-purple"><?= e($m['level_name']) ?></span>
              <?php else: ?>
                —
              <?php endif; ?>
            </td>
            <td>
              <span class="badge badge-<?= $m['is_active'] ? 'green' : 'red' ?>">
                <?= $m['is_active'] ? 'Active' : 'Inactive' ?>
              </span>
            </td>
            <td class="text-right">
              <button class="btn btn-secondary btn-sm" onclick="editModal(<?= htmlspecialchars(json_encode($m)) ?>)">Edit</button>
              <form method="POST" style="display:inline-block" onsubmit="return confirm('Are you sure you want to delete this member? Attendance records might be kept.')">
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= $m['id'] ?>">
                <button type="submit" class="btn btn-danger btn-sm">Delete</button>
              </form>
            </td>
          </tr>
          <?php endforeach; if (empty($members)): ?>
          <tr><td colspan="7" class="text-center" style="padding:40px;color:var(--text2)">No members found. Add one above.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Modal (Vanilla JS, no external libraries) -->
<div id="memberModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:1000;align-items:center;justify-content:center">
  <div class="card" style="width:100%;max-width:500px;margin:20px;position:relative">
    <button onclick="closeModal()" style="position:absolute;top:20px;right:20px;background:none;border:none;color:var(--text);font-size:24px;cursor:pointer">&times;</button>
    <h3 class="card-title mb-4" id="modalTitle">Add New Member</h3>
    <form method="POST">
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" id="m_id" value="0">
      
      <div class="form-group">
        <label class="form-label">Primary Name (Amharic) *</label>
        <input class="form-input" type="text" name="name" id="m_name" required>
      </div>
      
      <div class="form-group">
        <label class="form-label">English Name (Optional)</label>
        <input class="form-input" type="text" name="english_name" id="m_ename">
      </div>
      
      <div class="form-group">
        <label class="form-label">Group / Class (Optional)</label>
        <input class="form-input" type="text" name="group_name" id="m_group" placeholder="e.g. Group 1">
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Branch (Optional)</label>
          <select class="form-select" name="branch_id" id="m_branch">
            <option value="">— None —</option>
            <?php foreach ($branches as $b): ?>
              <option value="<?= $b['id'] ?>"><?= e($b['name']) ?></option>
            <?php endforeach; ?>
          </select>
          <?php if (empty($branches)): ?>
            <small style="color:var(--text3)"><a href="branches.php" style="color:var(--blue)">Add branches first →</a></small>
          <?php endif; ?>
        </div>
        <div class="form-group">
          <label class="form-label">Level (Optional)</label>
          <select class="form-select" name="level_id" id="m_level">
            <option value="">— None —</option>
            <?php foreach ($levels as $l): ?>
              <option value="<?= $l['id'] ?>"><?= e($l['name']) ?></option>
            <?php endforeach; ?>
          </select>
          <?php if (empty($levels)): ?>
            <small style="color:var(--text3)"><a href="branches.php" style="color:var(--blue)">Add levels first →</a></small>
          <?php endif; ?>
        </div>
      </div>
      
      <div class="form-group toggle-wrap" style="border:none;padding-bottom:0">
        <div>
          <div class="toggle-label">Active Status</div>
          <div class="toggle-sub">Inactive members won't appear in the mini app.</div>
        </div>
        <label class="toggle" id="m_toggle_wrap">
          <input type="checkbox" name="is_active" id="m_active" class="toggle-input" value="1" checked onchange="this.parentElement.classList.toggle('on', this.checked)">
        </label>
      </div>
      
      <div class="divider"></div>
      
      <div style="display:flex;justify-content:flex-end;gap:12px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Member</button>
      </div>
    </form>
  </div>
</div>

<script>
const modal = document.getElementById('memberModal');
const toggleWrap = document.getElementById('m_toggle_wrap');
const activeCheck = document.getElementById('m_active');

function openModal() {
    document.getElementById('modalTitle').innerText = 'Add New Member';
    document.getElementById('m_id').value = '0';
    document.getElementById('m_name').value = '';
    document.getElementById('m_ename').value = '';
    document.getElementById('m_group').value = '';
    document.getElementById('m_branch').value = '';
    document.getElementById('m_level').value = '';
    activeCheck.checked = true;
    toggleWrap.classList.add('on');
    modal.style.display = 'flex';
}

function editModal(data) {
    document.getElementById('modalTitle').innerText = 'Edit Member';
    document.getElementById('m_id').value = data.id;
    document.getElementById('m_name').value = data.name;
    document.getElementById('m_ename').value = data.english_name || '';
    document.getElementById('m_group').value = data.group_name || '';
    document.getElementById('m_branch').value = data.branch_id || '';
    document.getElementById('m_level').value = data.level_id || '';
    
    activeCheck.checked = !!data.is_active;
    if (activeCheck.checked) toggleWrap.classList.add('on');
    else toggleWrap.classList.remove('on');
    
    modal.style.display = 'flex';
}

function closeModal() {
    modal.style.display = 'none';
}
</script>

<?php include __DIR__ . '/_footer.php'; ?>
