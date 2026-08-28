<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/sheets.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Integrations';

// ── Fetch branches & levels for filtering ────────────────────────────────
$stmt = db()->prepare('SELECT name FROM branches WHERE company_id = ? ORDER BY name ASC');
$stmt->execute([$company['id']]);
$branches = array_column($stmt->fetchAll(), 'name');

$stmt = db()->prepare('SELECT name FROM levels WHERE company_id = ? ORDER BY name ASC');
$stmt->execute([$company['id']]);
$levels = array_column($stmt->fetchAll(), 'name');

// Currently selected filters (comma-separated in DB)
$selBranches = $company['google_sheet_branches']
    ? array_filter(array_map('trim', explode(',', $company['google_sheet_branches'])))
    : [];
$selLevels = $company['google_sheet_levels']
    ? array_filter(array_map('trim', explode(',', $company['google_sheet_levels'])))
    : [];

if (is_post()) {
    try {
        $eSheets = isset($_POST['enable_google_sheets']) ? 1 : 0;
        $sId     = trim($_POST['google_sheet_id'] ?? '');
        $sTab    = trim($_POST['google_sheet_tab'] ?? '');
        $sJson   = trim($_POST['google_service_account_json'] ?? '');
        $sBranches = $_POST['google_sheet_branches'] ?? [];
        $sLevels   = $_POST['google_sheet_levels'] ?? [];

        if ($sTab === '') $sTab = $company['name'];

        $branchesStr = implode(',', array_map('trim', array_filter($sBranches)));
        $levelsStr   = implode(',', array_map('trim', array_filter($sLevels)));

        if ($sJson) {
            $stmt = db()->prepare(
                'INSERT INTO company_settings (company_id, enable_google_sheets, google_sheet_id, google_sheet_tab, google_sheet_branches, google_sheet_levels, google_service_account_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 enable_google_sheets = VALUES(enable_google_sheets),
                 google_sheet_id = VALUES(google_sheet_id),
                 google_sheet_tab = VALUES(google_sheet_tab),
                 google_sheet_branches = VALUES(google_sheet_branches),
                 google_sheet_levels = VALUES(google_sheet_levels),
                 google_service_account_json = VALUES(google_service_account_json)'
            );
            $stmt->execute([$company['id'], $eSheets, $sId, $sTab, $branchesStr, $levelsStr, $sJson]);
        } else {
            $stmt = db()->prepare(
                'INSERT INTO company_settings (company_id, enable_google_sheets, google_sheet_id, google_sheet_tab, google_sheet_branches, google_sheet_levels)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 enable_google_sheets = VALUES(enable_google_sheets),
                 google_sheet_id = VALUES(google_sheet_id),
                 google_sheet_tab = VALUES(google_sheet_tab),
                 google_sheet_branches = VALUES(google_sheet_branches),
                 google_sheet_levels = VALUES(google_sheet_levels)'
            );
            $stmt->execute([$company['id'], $eSheets, $sId, $sTab, $branchesStr, $levelsStr]);
        }

        // If sheets are enabled, try to create the tab (verify credentials work too)
        $sheetNote = '';
        if ($eSheets && $sId && $sJson) {
            $creds = parse_service_account($sJson);
            if ($creds) {
                $res = sheets_ensure_tab($creds, $sId, $sTab);
                if ($res['created']) {
                    $sheetNote = " Sheet \"{$sTab}\" was created in your spreadsheet.";
                } elseif ($res['exists']) {
                    $sheetNote = " Sheet \"{$sTab}\" already exists and will be used.";
                } else {
                    $sheetNote = ' Could not reach the spreadsheet — check the Sheet ID, service account JSON, and that you shared the sheet with the service account client_email.';
                }
            }
        }

        flash_set('success', 'Integration settings saved.' . $sheetNote);
        redirect('integrations.php');
    } catch (Throwable $e) {
        flash_set('error', 'Error saving integrations: ' . $e->getMessage());
    }
}

include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div style="width:48px;height:48px;background:rgba(34,197,94,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">
        📊
      </div>
      <div>
        <h2 class="card-title">Google Sheets Sync</h2>
        <p class="card-subtitle">Automatically push all attendance records to a Google Sheet in real-time.</p>
      </div>
    </div>
    
    <form method="POST">
      <div class="form-group toggle-wrap">
        <div>
          <div class="toggle-label">Enable Google Sheets Sync</div>
          <div class="toggle-sub">Requires a Google Cloud Service Account.</div>
        </div>
        <label class="toggle <?= $company['enable_google_sheets'] ? 'on' : '' ?>">
          <input type="checkbox" name="enable_google_sheets" class="toggle-input" value="1" <?= $company['enable_google_sheets'] ? 'checked' : '' ?> onchange="this.parentElement.classList.toggle('on', this.checked)">
        </label>
      </div>

      <div class="form-group mt-4">
        <label class="form-label">Google Sheet ID</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="form-input" type="text" name="google_sheet_id" value="<?= e($company['google_sheet_id'] ?? '') ?>" placeholder="1BxiMVs0XRX5nZy..." style="flex:1">
          <?php if (!empty($company['google_sheet_id'])): ?>
            <a href="https://docs.google.com/spreadsheets/d/<?= e($company['google_sheet_id']) ?>/edit" target="_blank" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;white-space:nowrap">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open Sheet
            </a>
          <?php endif; ?>
        </div>
        <div class="form-hint">The long string in your spreadsheet URL between /d/ and /edit</div>
      </div>

      <div class="form-group">
        <label class="form-label">Sheet Name (Tab) — auto-created</label>
        <input class="form-input" type="text" name="google_sheet_tab" value="<?= e($company['google_sheet_tab'] ?? $company['name']) ?>" placeholder="<?= e($company['name']) ?>">
        <div class="form-hint">The tab inside your spreadsheet where attendance is written. Defaults to your Organization Name. It is created automatically when you save.</div>
      </div>

      <div class="divider"></div>

      <div class="form-group">
        <label class="form-label">Branches / Locations to Sync (optional)</label>
        <?php if (empty($branches)): ?>
          <div class="form-hint">No branches yet. You can create them under <a href="branches.php" style="color:var(--accent)">Branches & Levels</a>.</div>
        <?php else: ?>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <?php foreach ($branches as $b): ?>
              <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:0.9rem">
                <input type="checkbox" name="google_sheet_branches[]" value="<?= e($b) ?>" style="accent-color:var(--accent)"
                  <?= in_array($b, $selBranches, true) ? 'checked' : '' ?>>
                🏢 <?= e($b) ?>
              </label>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
        <div class="form-hint">Leave empty to sync all branches. Select one or more to sync only those.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Levels / Grades / Sections to Sync (optional)</label>
        <?php if (empty($levels)): ?>
          <div class="form-hint">No levels yet. You can create them under <a href="branches.php" style="color:var(--accent)">Branches & Levels</a>.</div>
        <?php else: ?>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <?php foreach ($levels as $lvl): ?>
              <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:0.9rem">
                <input type="checkbox" name="google_sheet_levels[]" value="<?= e($lvl) ?>" style="accent-color:var(--accent)"
                  <?= in_array($lvl, $selLevels, true) ? 'checked' : '' ?>>
                🎓 <?= e($lvl) ?>
              </label>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
        <div class="form-hint">Leave empty to sync all levels. Select one or more to sync only those.</div>
      </div>

      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Service Account JSON (Credentials)</label>
        <?php if ($company['google_service_account_json']): ?>
          <div class="alert alert-success" style="padding:8px 12px;margin-bottom:10px">
            ✅ Credentials are currently saved. To update, paste new JSON below.
          </div>
        <?php endif; ?>
        <textarea class="form-textarea" name="google_service_account_json" style="font-family:monospace;font-size:0.8rem" placeholder='{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  ...
}'></textarea>
        <div class="form-hint">Paste the entire JSON file contents. Note: You must share your Google Sheet with the <code>client_email</code> found inside the JSON with "Editor" permissions.</div>
      </div>
      
      <button type="submit" class="btn btn-primary mt-4">Save Integration</button>

      <button type="button" class="btn btn-secondary mt-4" id="btn-test-sheet" onclick="testSheet()" style="margin-left:10px">🔍 Test Connection</button>
      <div id="sheet-test-result" style="margin-top:14px"></div>
    </form>
  </div>
</div>

<script>
const TEST_PATH = '<?= BASE_PATH ?>';
async function testSheet() {
    const btn = document.getElementById('btn-test-sheet');
    const res = document.getElementById('sheet-test-result');
    btn.disabled = true;
    btn.innerText = 'Testing...';
    res.innerHTML = '';
    try {
        const r = await fetch(TEST_PATH + '/api/test-sheet.php', {
            method: 'POST',
            credentials: 'same-origin'
        });
        const data = await r.json();
        let html = '<div class="card" style="max-width:600px;padding:16px">';
        if (data.success) {
            html += '<div class="alert alert-success" style="margin-bottom:10px">✅ ' + data.message + '</div>';
            html += '<p style="margin:4px 0;font-size:0.9rem"><strong>Tab used:</strong> ' + data.tab + ' ' + (data.tabExists ? '(exists)' : data.tabCreated ? '(was created)' : '(missing)') + '</p>';
        } else {
            html += '<div class="alert alert-error" style="margin-bottom:10px">❌ ' + (data.error || 'Test failed') + '</div>';
        }
        if (data.steps && data.steps.length) {
            html += '<div style="margin-top:8px;font-size:0.85rem;color:var(--text2)">';
            data.steps.forEach(s => html += '<div>• ' + s + '</div>');
            html += '</div>';
        }
        if (data.tabs && data.tabs.length) {
            html += '<div style="margin-top:8px;font-size:0.85rem;color:var(--text2)"><strong>Tabs in sheet:</strong> ' + data.tabs.join(', ') + '</div>';
        }
        html += '</div>';
        res.innerHTML = html;
    } catch (e) {
        res.innerHTML = '<div class="alert alert-error">Network error: ' + e.message + '</div>';
    } finally {
        btn.disabled = false;
        btn.innerText = '🔍 Test Connection';
    }
}
</script>

<?php include __DIR__ . '/_footer.php'; ?>
