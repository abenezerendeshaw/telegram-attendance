<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/spreadsheet.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Import Members';

// ── Sample template download ──────────────────────────────────────────────
if (isset($_GET['sample'])) {
    $format = ($_GET['sample'] === 'xlsx') ? 'xlsx' : 'csv';
    $sample = [
        ['Primary Name (Amharic) *', 'English Name', 'Group / Class', 'Branch', 'Level'],
        ['አበበ በቀለ', 'Abebe Bekele', 'ቡድን 1', 'Addis Ababa', 'Level 1'],
        ['ሳራ አለሙ', 'Sara Alemu', 'ቡድን 2', 'Addis Ababa', 'Level 2'],
    ];

    if ($format === 'xlsx') {
        $tmp = tempnam(sys_get_temp_dir(), 'sample');
        if ($tmp === false || !xlsx_write_rows($tmp, $sample)) {
            http_response_code(500);
            die('Could not generate the Excel sample. The ZipArchive PHP extension may be missing.');
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="members-sample.xlsx"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        unlink($tmp);
        exit;
    }

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="members-sample.csv"');
    $fh = fopen('php://output', 'w');
    if ($fh) {
        foreach ($sample as $row) fputcsv($fh, $row);
        fclose($fh);
    }
    exit;
}

// ── Handle import ─────────────────────────────────────────────────────────
if (is_post() && isset($_POST['action']) && $_POST['action'] === 'import') {
    $f = $_FILES['file'] ?? null;

    if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
        flash_set('error', 'Please choose a CSV or Excel (.xlsx) file to import.');
        redirect('members-import.php');
    }

    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    $rows = [];
    if ($ext === 'csv' || $ext === 'txt') {
        $rows = csv_read_rows($f['tmp_name']);
    } elseif ($ext === 'xlsx') {
        if (!class_exists('ZipArchive')) {
            flash_set('error', 'Excel (.xlsx) import requires the ZipArchive PHP extension. Please use the CSV format.');
            redirect('members-import.php');
        }
        $rows = xlsx_read_rows($f['tmp_name']);
    } else {
        flash_set('error', 'Unsupported file type. Use .csv or .xlsx.');
        redirect('members-import.php');
    }

    // Remove fully-empty trailing rows
    $rows = array_values(array_filter($rows, fn($r) => implode('', $r) !== ''));

    if (!$rows) {
        flash_set('error', 'The file appears to be empty or unreadable.');
        redirect('members-import.php');
    }

    // ── Header detection & column mapping ─────────────────────────────────
    $map = ['name' => 0, 'english_name' => 1, 'group_name' => 2, 'branch' => 3, 'level' => 4];
    $first = array_map('strtolower', array_map('trim', $rows[0]));
    $joined = implode(' ', $first);
    $looksLikeHeader = false;
    foreach (['primary name', 'english name', 'group', 'branch', 'level'] as $h) {
        if (mb_strpos($joined, $h) !== false) { $looksLikeHeader = true; break; }
    }
    if ($looksLikeHeader) {
        $map = ['name' => null, 'english_name' => null, 'group_name' => null, 'branch' => null, 'level' => null];
        foreach ($first as $i => $h) {
            if (mb_strpos($h, 'english') !== false) {
                $map['english_name'] = $i;
            } elseif ($map['name'] === null && (mb_strpos($h, 'primary') !== false || mb_strpos($h, 'name') !== false)) {
                $map['name'] = $i;
            } elseif (mb_strpos($h, 'group') !== false) {
                $map['group_name'] = $i;
            } elseif (mb_strpos($h, 'branch') !== false) {
                $map['branch'] = $i;
            } elseif (mb_strpos($h, 'level') !== false) {
                $map['level'] = $i;
            }
        }
        array_shift($rows); // drop header row
    }

    // ── Preload existing branches/levels ──────────────────────────────────
    $branchByName = [];
    $stmt = db()->prepare('SELECT id, name FROM branches WHERE company_id = ?');
    $stmt->execute([$company['id']]);
    foreach ($stmt->fetchAll() as $b) $branchByName[mb_strtolower($b['name'])] = (int)$b['id'];

    $levelByName = [];
    $stmt = db()->prepare('SELECT id, name FROM levels WHERE company_id = ?');
    $stmt->execute([$company['id']]);
    foreach ($stmt->fetchAll() as $l) $levelByName[mb_strtolower($l['name'])] = (int)$l['id'];

    $insert = db()->prepare('INSERT INTO members (company_id, name, english_name, group_name, branch_id, level_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)');
    $addBranch = db()->prepare('INSERT INTO branches (company_id, name) VALUES (?, ?)');
    $addLevel = db()->prepare('INSERT INTO levels (company_id, name) VALUES (?, ?)');

    $created = 0;
    $skipped = 0;
    foreach ($rows as $row) {
        $name = trim((string)($row[$map['name'] ?? 0] ?? ''));
        if ($name === '') { $skipped++; continue; }

        $ename = trim((string)($row[$map['english_name'] ?? 1] ?? ''));
        $group = trim((string)($row[$map['group_name'] ?? 2] ?? ''));
        $branchName = trim((string)($row[$map['branch'] ?? 3] ?? ''));
        $levelName  = trim((string)($row[$map['level'] ?? 4] ?? ''));

        $branchId = null;
        if ($branchName !== '') {
            $key = mb_strtolower($branchName);
            if (!isset($branchByName[$key])) {
                $addBranch->execute([$company['id'], $branchName]);
                $branchId = (int)db()->lastInsertId();
                $branchByName[$key] = $branchId;
            } else {
                $branchId = $branchByName[$key];
            }
        }

        $levelId = null;
        if ($levelName !== '') {
            $key = mb_strtolower($levelName);
            if (!isset($levelByName[$key])) {
                $addLevel->execute([$company['id'], $levelName]);
                $levelId = (int)db()->lastInsertId();
                $levelByName[$key] = $levelId;
            } else {
                $levelId = $levelByName[$key];
            }
        }

        try {
            $insert->execute([$company['id'], $name, $ename ?: null, $group ?: null, $branchId, $levelId]);
            $created++;
        } catch (PDOException $ex) {
            $skipped++;
            error_log('[Members import] ' . $ex->getMessage());
        }
    }

    flash_set($created > 0 ? 'success' : 'error', "Import complete: {$created} member(s) added, {$skipped} skipped.");
    redirect('members.php');
}

include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Import <?= e(member_type_label($company['member_type'] ?? 'student', true)) ?></h2>
      <p class="card-subtitle">Bulk-add <?= e(member_type_label($company['member_type'] ?? 'student', true)) ?>s from a CSV or Excel (.xlsx) file</p>
    </div>
    <div class="topbar-actions">
      <a href="members.php" class="btn btn-secondary">← Back to Members</a>
    </div>
  </div>

  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <div>
        <h3 class="card-title" style="font-size:16px">1. Download the sample template</h3>
        <p class="card-subtitle">Fill in your member data, keeping the column order and headers intact.</p>
      </div>
    </div>
    <div style="padding:0 20px 20px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="?sample=csv" class="btn btn-primary">Download CSV Sample</a>
        <a href="?sample=xlsx" class="btn btn-secondary">Download Excel (.xlsx) Sample</a>
      </div>
      <div class="divider"></div>
      <div style="font-size:0.9rem;color:var(--text2);line-height:1.7">
        <strong style="color:var(--text)">Accepted columns:</strong>
        <code style="background:var(--surface2);padding:2px 6px;border-radius:6px">Primary Name (Amharic) *</code>,
        <code style="background:var(--surface2);padding:2px 6px;border-radius:6px">English Name</code>,
        <code style="background:var(--surface2);padding:2px 6px;border-radius:6px">Group / Class</code>,
        <code style="background:var(--surface2);padding:2px 6px;border-radius:6px">Branch</code>,
        <code style="background:var(--surface2);padding:2px 6px;border-radius:6px">Level</code>.
        <br>
        <strong style="color:var(--text)">Rules:</strong>
        <ul style="margin:8px 0 0;padding-left:20px">
          <li>The <strong>Primary Name</strong> is required for every row.</li>
          <li>Branch and Level are optional. New branches / levels are created automatically.</li>
          <li>If your file has no header row, columns are read as: Name, English Name, Group, Branch, Level.</li>
          <li>The first row is treated as a header and skipped when it contains column labels.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title" style="font-size:16px">2. Upload your file</h3>
        <p class="card-subtitle">Import .csv or .xlsx (max 5MB)</p>
      </div>
    </div>
    <div style="padding:0 20px 20px">
      <form method="POST" enctype="multipart/form-data">
        <input type="hidden" name="action" value="import">
        <div class="form-group">
          <label class="form-label">Spreadsheet File</label>
          <input class="form-input" type="file" name="file" id="importFile" accept=".csv,.txt,.xlsx" required>
          <div class="form-hint">The file is read and inserted immediately after upload.</div>
        </div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:flex-end;gap:12px">
          <button type="button" class="btn btn-secondary" onclick="window.location.href='members.php'">Cancel</button>
          <button type="submit" class="btn btn-primary">Import Members</button>
        </div>
      </form>
    </div>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
