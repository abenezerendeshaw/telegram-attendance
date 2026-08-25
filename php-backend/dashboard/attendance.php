<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

$company = require_auth();
$pageTitle = 'Attendance Log';

// Filter
$dateFilter = $_GET['date'] ?? get_ethiopian_date(eat_now());

// Fetch distinct dates for the dropdown
$stmt = db()->prepare('SELECT DISTINCT eth_date FROM attendance_records WHERE company_id = ? ORDER BY submitted_at DESC');
$stmt->execute([$company['id']]);
$dates = $stmt->fetchAll(PDO::FETCH_COLUMN);
if (!in_array($dateFilter, $dates) && $dates) {
    // If the requested date isn't found, maybe default to the latest date available
    // (We keep dateFilter as is for now, but this is just for UI logic)
}

// Fetch records for the selected date
$stmt = db()->prepare('SELECT * FROM attendance_records WHERE company_id = ? AND eth_date = ? ORDER BY submitted_at DESC');
$stmt->execute([$company['id'], $dateFilter]);
$records = $stmt->fetchAll();

include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Attendance Log</h2>
      <p class="card-subtitle">Showing records for: <strong><?= e($dateFilter) ?></strong></p>
    </div>
    
    <div class="topbar-actions">
      <form method="GET" style="display:flex;gap:10px">
        <select name="date" class="form-select" onchange="this.form.submit()" style="width:250px">
          <option value="<?= e($dateFilter) ?>" selected><?= e($dateFilter) ?></option>
          <?php foreach ($dates as $d): if ($d === $dateFilter) continue; ?>
            <option value="<?= e($d) ?>"><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </form>
    </div>
  </div>

  <div class="card p-0">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Name</th>
            <th>Group</th>
            <th>Status</th>
            <th>Reason / GPS</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($records as $r): ?>
          <tr>
            <td style="color:var(--text2);font-size:0.85rem">
              <?= e($r['eth_time']) ?><br>
              <small><?= date('H:i', strtotime($r['submitted_at'])) ?> EAT</small>
            </td>
            <td style="font-weight:600"><?= e($r['member_name']) ?></td>
            <td><?= e($r['group_name'] ?: '—') ?></td>
            <td>
              <span class="badge badge-<?= $r['status'] === 'present' ? 'green' : 'amber' ?>">
                <?= $r['status'] === 'present' ? '✅ Present' : '📝 Permission' ?>
              </span>
              <?php if ($r['is_admin_override']): ?>
                <span class="badge badge-gray" style="margin-left:5px" title="Submitted by admin">Admin</span>
              <?php endif; ?>
            </td>
            <td style="font-size:0.85rem;color:var(--text2)">
              <?php if ($r['status'] === 'permission'): ?>
                <?= e($r['reason']) ?>
              <?php elseif ($r['latitude'] && $r['longitude']): ?>
                <a href="https://www.google.com/maps?q=<?= $r['latitude'] ?>,<?= $r['longitude'] ?>" target="_blank" style="color:var(--blue);text-decoration:none">View Map</a>
              <?php else: ?>
                —
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; if (empty($records)): ?>
          <tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text2)">No attendance recorded for this date.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
