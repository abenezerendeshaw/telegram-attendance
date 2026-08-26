<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Integrations';

if (is_post()) {
    try {
        $eSheets = isset($_POST['enable_google_sheets']) ? 1 : 0;
        $sId     = trim($_POST['google_sheet_id'] ?? '');
        $sJson   = trim($_POST['google_service_account_json'] ?? '');
        
        if ($sJson) {
            $stmt = db()->prepare(
                'INSERT INTO company_settings (company_id, enable_google_sheets, google_sheet_id, google_service_account_json)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 enable_google_sheets = VALUES(enable_google_sheets),
                 google_sheet_id = VALUES(google_sheet_id),
                 google_service_account_json = VALUES(google_service_account_json)'
            );
            $stmt->execute([$company['id'], $eSheets, $sId, $sJson]);
        } else {
            $stmt = db()->prepare(
                'INSERT INTO company_settings (company_id, enable_google_sheets, google_sheet_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 enable_google_sheets = VALUES(enable_google_sheets),
                 google_sheet_id = VALUES(google_sheet_id)'
            );
            $stmt->execute([$company['id'], $eSheets, $sId]);
        }
        
        flash_set('success', 'Integration settings saved.');
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
        <input class="form-input" type="text" name="google_sheet_id" value="<?= e($company['google_sheet_id'] ?? '') ?>" placeholder="1BxiMVs0XRX5nZy...">
        <div class="form-hint">The long string in your spreadsheet URL between /d/ and /edit</div>
      </div>
      
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
    </form>
  </div>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
