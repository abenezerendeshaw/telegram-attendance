<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Attendance Rules';

if (is_post()) {
    $cLat  = trim($_POST['class_lat'] ?? '');
    $cLng  = trim($_POST['class_lng'] ?? '');
    $dist  = (int)($_POST['max_distance_meters'] ?? 400);
    $dGps  = isset($_POST['disable_gps_check']) ? 1 : 0;
    
    $wStart = trim($_POST['attendance_window_start'] ?? '23:30');
    $wEnd   = trim($_POST['attendance_window_end'] ?? '02:30');
    $dOff   = isset($_POST['allow_offtime_submission']) ? 1 : 0;
    $dMult  = isset($_POST['allow_multiple_submissions']) ? 1 : 0;
    $dRec   = isset($_POST['enable_receipt_upload']) ? 1 : 0;
    
    $days = [];
    if (!empty($_POST['days']) && is_array($_POST['days'])) {
        foreach ($_POST['days'] as $d) {
            $val = (int)$d;
            if ($val >= 0 && $val <= 6) $days[] = $val;
        }
    }
    $cDays = implode(',', $days) ?: '1,3,5';

    $stmt = db()->prepare(
        'UPDATE company_settings SET 
         class_lat = ?, class_lng = ?, max_distance_meters = ?, disable_gps_check = ?,
         attendance_window_start = ?, attendance_window_end = ?, class_days = ?,
         allow_offtime_submission = ?, allow_multiple_submissions = ?, enable_receipt_upload = ?
         WHERE company_id = ?'
    );
    
    $stmt->execute([
        $cLat ?: null, $cLng ?: null, $dist, $dGps,
        $wStart, $wEnd, $cDays,
        $dOff, $dMult, $dRec,
        $company['id']
    ]);
    
    flash_set('success', 'Attendance rules updated.');
    redirect('attendance-settings.php');
}

$cDaysArr = explode(',', $company['class_days'] ?? '1,3,5');
$daysList = ['0'=>'Sunday (እሑድ)', '1'=>'Monday (ሰኞ)', '2'=>'Tuesday (ማክሰኞ)', '3'=>'Wednesday (ረቡዕ)', '4'=>'Thursday (ሐሙስ)', '5'=>'Friday (ዓርብ)', '6'=>'Saturday (ቅዳሜ)'];

include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <form method="POST">
    <div class="grid-2">
      <!-- GPS Configuration -->
      <div class="card">
        <h3 class="section-title">GPS Location Constraints</h3>
        <p class="section-sub">Require members to be at a specific location.</p>
        
        <div class="form-group toggle-wrap">
          <div>
            <div class="toggle-label">Disable GPS Check</div>
            <div class="toggle-sub">If checked, members can sign in from anywhere.</div>
          </div>
          <label class="toggle <?= $company['disable_gps_check'] ? 'on' : '' ?>">
            <input type="checkbox" name="disable_gps_check" class="toggle-input" value="1" <?= $company['disable_gps_check'] ? 'checked' : '' ?> onchange="this.parentElement.classList.toggle('on', this.checked)">
          </label>
        </div>

        <div class="grid-2 mt-4">
          <div class="form-group">
            <label class="form-label">Latitude</label>
            <input class="form-input" type="text" name="class_lat" value="<?= e($company['class_lat'] ?? '') ?>" placeholder="9.0192">
          </div>
          <div class="form-group">
            <label class="form-label">Longitude</label>
            <input class="form-input" type="text" name="class_lng" value="<?= e($company['class_lng'] ?? '') ?>" placeholder="38.7525">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Max Allowed Distance (Meters)</label>
          <input class="form-input" type="number" name="max_distance_meters" value="<?= e($company['max_distance_meters'] ?? '400') ?>">
        </div>
      </div>

      <!-- Time Windows -->
      <div class="card">
        <h3 class="section-title">Time & Schedule</h3>
        <p class="section-sub">When are members allowed to submit attendance?</p>
        
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Window Start (24h)</label>
            <input class="form-input" type="time" name="attendance_window_start" value="<?= e($company['attendance_window_start'] ?? '23:30') ?>">
          </div>
          <div class="form-group">
            <label class="form-label">Window End (24h)</label>
            <input class="form-input" type="time" name="attendance_window_end" value="<?= e($company['attendance_window_end'] ?? '02:30') ?>">
          </div>
        </div>

        <div class="form-group mt-4">
          <label class="form-label">Class/Work Days</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <?php foreach ($daysList as $val => $label): ?>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="days[]" value="<?= $val ?>" <?= in_array((string)$val, $cDaysArr, true) ? 'checked' : '' ?>>
                <span style="font-size:0.9rem"><?= $label ?></span>
              </label>
            <?php endforeach; ?>
          </div>
        </div>
        
        <div class="form-group toggle-wrap mt-4" style="border-top:1px solid var(--border);padding-top:16px">
          <div>
            <div class="toggle-label">Allow Off-Time Submissions</div>
            <div class="toggle-sub">Bypass time and day restrictions entirely.</div>
          </div>
          <label class="toggle <?= $company['allow_offtime_submission'] ? 'on' : '' ?>">
            <input type="checkbox" name="allow_offtime_submission" class="toggle-input" value="1" <?= $company['allow_offtime_submission'] ? 'checked' : '' ?> onchange="this.parentElement.classList.toggle('on', this.checked)">
          </label>
        </div>
      </div>
    </div>

    <!-- Extra features -->
    <div class="card">
      <h3 class="section-title">Additional Features</h3>
      
      <div class="form-group toggle-wrap">
        <div>
          <div class="toggle-label">Allow Multiple Submissions Per Day</div>
          <div class="toggle-sub">By default, users can only submit once per day. Enable this to allow multiple.</div>
        </div>
        <label class="toggle <?= $company['allow_multiple_submissions'] ? 'on' : '' ?>">
          <input type="checkbox" name="allow_multiple_submissions" class="toggle-input" value="1" <?= $company['allow_multiple_submissions'] ? 'checked' : '' ?> onchange="this.parentElement.classList.toggle('on', this.checked)">
        </label>
      </div>

      <div class="form-group toggle-wrap" style="border:none">
        <div>
          <div class="toggle-label">Enable Receipt Uploads</div>
          <div class="toggle-sub">Adds a "Submit Receipt" tab to the mini app for payment tracking.</div>
        </div>
        <label class="toggle <?= $company['enable_receipt_upload'] ? 'on' : '' ?>">
          <input type="checkbox" name="enable_receipt_upload" class="toggle-input" value="1" <?= $company['enable_receipt_upload'] ? 'checked' : '' ?> onchange="this.parentElement.classList.toggle('on', this.checked)">
        </label>
      </div>
    </div>

    <button type="submit" class="btn btn-primary btn-lg">Save Attendance Rules</button>
  </form>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
