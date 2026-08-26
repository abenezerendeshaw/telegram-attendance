<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/ethiopian_date.php';

$company = require_auth();
$pageTitle = 'Attendance Log';

// Filters
$dateFilter  = $_GET['date'] ?? get_ethiopian_date(eat_now());
$levelFilter = trim($_GET['level'] ?? 'all');

// ── Fetch all levels for tab navigation ──────────────────────────────────
$stmt = db()->prepare('SELECT id, name FROM levels WHERE company_id = ? ORDER BY name ASC');
$stmt->execute([$company['id']]);
$dbLevels = $stmt->fetchAll();

$stmt = db()->prepare('SELECT DISTINCT level_name FROM attendance_records WHERE company_id = ? AND level_name IS NOT NULL AND level_name != ""');
$stmt->execute([$company['id']]);
$recLevels = $stmt->fetchAll(PDO::FETCH_COLUMN);

$stmt = db()->prepare('SELECT DISTINCT l.name FROM members m JOIN levels l ON m.level_id = l.id WHERE m.company_id = ?');
$stmt->execute([$company['id']]);
$memLevels = $stmt->fetchAll(PDO::FETCH_COLUMN);

$allLevelNames = array_values(array_unique(array_filter(array_merge(
    array_column($dbLevels, 'name'),
    $recLevels,
    $memLevels
))));
sort($allLevelNames);

// ── Excel Export Handler (ሙሉ ስም | ቡድን | ሁኔታ | ቀን | ሰዓት) ──────────────────
if (isset($_GET['export'])) {
    $slugName = slugify($company['name']);

    $sql = 'SELECT ar.*, m.level_id, l.name as level_name 
            FROM attendance_records ar
            LEFT JOIN members m ON ar.member_id = m.id
            LEFT JOIN levels l ON m.level_id = l.id
            WHERE ar.company_id = ?';
    $params = [$company['id']];

    if ($levelFilter !== 'all' && $levelFilter !== '') {
        $sql .= ' AND (ar.level_name = ? OR l.name = ?)';
        $params[] = $levelFilter;
        $params[] = $levelFilter;
    }

    if (!empty($dateFilter) && $dateFilter !== 'all') {
        $sql .= ' AND ar.eth_date = ?';
        $params[] = $dateFilter;
    }

    $sql .= ' ORDER BY ar.submitted_at DESC';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $fileName = 'Attendance_Log_' . $slugName . '_' . date('Y-m-d') . '.xls';
    header('Content-Type: application/vnd.ms-excel; charset=utf-8');
    header("Content-Disposition: attachment; filename=\"{$fileName}\"");
    header('Cache-Control: max-age=0');

    echo '<!DOCTYPE html><html><head><meta charset="utf-8">';
    echo '<style>';
    echo 'table { border-collapse: collapse; font-family: sans-serif; font-size: 13px; width: 100%; }';
    echo 'th { background-color: #d97706; color: #ffffff; padding: 10px; border: 1px solid #b45309; text-align: left; }';
    echo 'td { padding: 8px; border: 1px solid #e5e0d6; text-align: left; }';
    echo '.present { color: #16a34a; font-weight: bold; }';
    echo '.perm { color: #d97706; font-weight: bold; }';
    echo '</style></head><body>';
    echo '<h2>' . htmlspecialchars($company['name']) . ' — Attendance Log / አቴንዳንስ ሎግ</h2>';
    echo '<p>Level: <strong>' . htmlspecialchars($levelFilter === 'all' ? 'All Levels' : $levelFilter) . '</strong> | Date: <strong>' . htmlspecialchars($dateFilter) . '</strong></p>';
    echo '<table border="1"><thead><tr>';
    echo '<th>ሙሉ ስም</th><th>ቡድን</th><th>ሁኔታ</th><th>ቀን</th><th>ሰዓት</th>';
    echo '</tr></thead><tbody>';

    foreach ($rows as $r) {
        $stLabel = $r['status'] === 'present' ? 'የተገኘ' : 'ፈቃድ';
        $stClass = $r['status'] === 'present' ? 'present' : 'perm';
        $timeVal = $r['eth_time'] ?: date('H:i:s', strtotime($r['submitted_at']));

        echo '<tr>';
        echo '<td>' . htmlspecialchars($r['member_name']) . '</td>';
        echo '<td>' . htmlspecialchars($r['group_name'] ?: '—') . '</td>';
        echo '<td class="' . $stClass . '">' . htmlspecialchars($stLabel) . '</td>';
        echo '<td>' . htmlspecialchars($r['eth_date']) . '</td>';
        echo '<td>' . htmlspecialchars($timeVal) . '</td>';
        echo '</tr>';
    }

    echo '</tbody></table></body></html>';
    exit;
}

// ── Fetch distinct dates for dropdown ─────────────────────────────────────
$stmt = db()->prepare('SELECT DISTINCT eth_date FROM attendance_records WHERE company_id = ? ORDER BY submitted_at DESC');
$stmt->execute([$company['id']]);
$dates = $stmt->fetchAll(PDO::FETCH_COLUMN);

// ── Fetch records for the selected date & level filter ────────────────────
if ($levelFilter !== 'all' && $levelFilter !== '') {
    $stmt = db()->prepare(
        'SELECT ar.* FROM attendance_records ar
         LEFT JOIN members m ON ar.member_id = m.id
         LEFT JOIN levels l ON m.level_id = l.id
         WHERE ar.company_id = ? AND ar.eth_date = ?
           AND (ar.level_name = ? OR l.name = ?)
         ORDER BY ar.submitted_at DESC'
    );
    $stmt->execute([$company['id'], $dateFilter, $levelFilter, $levelFilter]);
} else {
    $stmt = db()->prepare('SELECT * FROM attendance_records WHERE company_id = ? AND eth_date = ? ORDER BY submitted_at DESC');
    $stmt->execute([$company['id'], $dateFilter]);
}
$records = $stmt->fetchAll();

include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Attendance Log</h2>
      <p class="card-subtitle">Showing records for: <strong><?= e($dateFilter) ?></strong> <?= $levelFilter !== 'all' ? '— Level: <strong>' . e($levelFilter) . '</strong>' : '' ?></p>
    </div>
    
    <div class="topbar-actions" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <form method="GET" style="display:flex;gap:10px;align-items:center">
        <?php if ($levelFilter !== 'all'): ?>
          <input type="hidden" name="level" value="<?= e($levelFilter) ?>">
        <?php endif; ?>
        <select name="date" class="form-select" onchange="this.form.submit()" style="width:200px">
          <option value="<?= e($dateFilter) ?>" selected><?= e($dateFilter) ?></option>
          <?php foreach ($dates as $d): if ($d === $dateFilter) continue; ?>
            <option value="<?= e($d) ?>"><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </form>

      <a href="attendance.php?export=1&level=<?= urlencode($levelFilter) ?>&date=<?= urlencode($dateFilter) ?>" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export Excel Sheet (.xls)
      </a>
    </div>
  </div>

  <!-- Level Tabs -->
  <div style="display:flex;gap:10px;margin-bottom:20px;overflow-x:auto;padding-bottom:6px">
    <a href="attendance.php?level=all&date=<?= urlencode($dateFilter) ?>" 
       class="btn <?= $levelFilter === 'all' ? 'btn-primary' : 'btn-secondary' ?>" 
       style="border-radius:20px;padding:8px 20px;font-size:0.88rem;text-decoration:none;white-space:nowrap">
      🏢 All Levels
    </a>
    <?php foreach ($allLevelNames as $lvlName): ?>
      <a href="attendance.php?level=<?= urlencode($lvlName) ?>&date=<?= urlencode($dateFilter) ?>" 
         class="btn <?= $levelFilter === $lvlName ? 'btn-primary' : 'btn-secondary' ?>" 
         style="border-radius:20px;padding:8px 20px;font-size:0.88rem;text-decoration:none;white-space:nowrap">
        🎓 <?= e($lvlName) ?>
      </a>
    <?php endforeach; ?>
  </div>

  <div class="card p-0">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Name</th>
            <th>Group</th>
            <th>Branch</th>
            <th>Level</th>
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
            <td><?= e($r['branch_name'] ?: '—') ?></td>
            <td><?= e($r['level_name'] ?: '—') ?></td>
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
          <tr><td colspan="7" class="text-center" style="padding:40px;color:var(--text2)">No attendance recorded for this filter.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
