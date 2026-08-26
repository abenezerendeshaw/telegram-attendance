<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$flash   = flash_get();
$pageTitle = 'Telegram Bot Setup';

if (is_post()) {
    $sToken = trim($_POST['telegram_bot_token'] ?? '');
    $sChat  = trim($_POST['telegram_chat_id'] ?? '');
    $tPres  = trim($_POST['telegram_topic_present'] ?? '');
    $tAbs   = trim($_POST['telegram_topic_absent'] ?? '');
    $tPerm  = trim($_POST['telegram_topic_permission'] ?? '');
    $tRec   = trim($_POST['telegram_topic_receipt'] ?? '');
    
    $aToken = trim($_POST['admin_bot_token'] ?? '');
    $aAdmins= trim($_POST['admin_bot_admins'] ?? '');

    $stmt = db()->prepare(
        'UPDATE company_settings SET 
         telegram_bot_token = ?, telegram_chat_id = ?, 
         telegram_topic_present = ?, telegram_topic_absent = ?, telegram_topic_permission = ?, telegram_topic_receipt = ?,
         admin_bot_token = ?, admin_bot_admins = ?
         WHERE company_id = ?'
    );
    
    $stmt->execute([
        $sToken ?: null, $sChat ?: null, 
        $tPres ?: null, $tAbs ?: null, $tPerm ?: null, $tRec ?: null,
        $aToken ?: null, $aAdmins ?: null,
        $company['id']
    ]);
    
    flash_set('success', 'Bot settings saved successfully.');
    redirect('bot-setup.php');
}

include __DIR__ . '/_header.php';
?>

<div class="content">
  <?php if ($flash): ?><div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['msg']) ?></div><?php endif; ?>

  <div class="card">
    <h2 class="card-title">Telegram Student/Employee Bot</h2>
    <p class="card-subtitle">This bot handles daily attendance marking, notifications, and receipts.</p>
    
    <form method="POST" style="margin-top:24px">
      
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Bot Token (From @BotFather)</label>
          <input class="form-input" type="text" name="telegram_bot_token" value="<?= e($company['telegram_bot_token'] ?? '') ?>" placeholder="123456789:ABCdefGHIjklMNOpqr...">
        </div>
        
        <div class="form-group">
          <label class="form-label">Main Chat/Channel ID</label>
          <input class="form-input" type="text" name="telegram_chat_id" value="<?= e($company['telegram_chat_id'] ?? '') ?>" placeholder="-100123456789">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Webhook URL (Read Only)</label>
        <div style="display:flex;gap:10px">
          <input class="form-input" type="text" value="https://specificethiopian.com/evaluation/webhook/<?= e($company['slug']) ?>" readonly style="background:rgba(255,255,255,0.02)">
          <?php if (!empty($company['telegram_bot_token'])): ?>
            <button type="button" class="btn btn-secondary" onclick="registerWebhook('student')" id="btn-reg-student">Register Webhook</button>
          <?php endif; ?>
        </div>
        <div class="form-hint" id="res-student">Click register to link your bot with this system.</div>
      </div>

      <div class="divider"></div>
      <h3 class="section-title mb-4">Topic / Thread IDs (Optional)</h3>
      <p class="section-sub">If you're using a Telegram group with topics enabled, enter the thread IDs here to route messages.</p>
      
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Present Topic ID</label>
          <input class="form-input" type="number" name="telegram_topic_present" value="<?= e($company['telegram_topic_present'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="form-label">Absent Topic ID (Cron Reports)</label>
          <input class="form-input" type="number" name="telegram_topic_absent" value="<?= e($company['telegram_topic_absent'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="form-label">Permission Topic ID</label>
          <input class="form-input" type="number" name="telegram_topic_permission" value="<?= e($company['telegram_topic_permission'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="form-label">Receipt Uploads Topic ID</label>
          <input class="form-input" type="number" name="telegram_topic_receipt" value="<?= e($company['telegram_topic_receipt'] ?? '') ?>">
        </div>
      </div>
      
      <div class="divider"></div>
      
      <h2 class="card-title mt-4">Admin Bot (Optional)</h2>
      <p class="card-subtitle">A separate bot just for admins to check stats, group info, and search.</p>
      
      <div class="grid-2" style="margin-top:20px">
        <div class="form-group">
          <label class="form-label">Admin Bot Token</label>
          <input class="form-input" type="text" name="admin_bot_token" value="<?= e($company['admin_bot_token'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="form-label">Authorized Admin Telegram IDs (Comma separated)</label>
          <input class="form-input" type="text" name="admin_bot_admins" value="<?= e($company['admin_bot_admins'] ?? '') ?>" placeholder="1234567, 9876543">
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Admin Webhook URL</label>
        <div style="display:flex;gap:10px">
          <input class="form-input" type="text" value="https://specificethiopian.com/evaluation/webhook/<?= e($company['slug']) ?>?bot=admin" readonly style="background:rgba(255,255,255,0.02)">
          <?php if (!empty($company['admin_bot_token'])): ?>
            <button type="button" class="btn btn-secondary" onclick="registerWebhook('admin')" id="btn-reg-admin">Register Admin Webhook</button>
          <?php endif; ?>
        </div>
        <div class="form-hint" id="res-admin"></div>
      </div>

      <div class="divider"></div>
      <button type="submit" class="btn btn-primary">Save Bot Configurations</button>
    </form>
  </div>
</div>

<script>
const BASE_PATH = '<?= BASE_PATH ?>';
function registerWebhook(type) {
    const btn = document.getElementById('btn-reg-' + type);
    const res = document.getElementById('res-' + type);
    btn.disabled = true;
    btn.innerText = 'Registering...';
    
    fetch(BASE_PATH + '/api/register-webhook.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot: type })
    })
    .then(r => r.json())
    .then(data => {
        if(data.success) {
            res.innerHTML = `<span style="color:var(--green)">${data.message}</span>`;
            btn.innerText = 'Registered!';
        } else {
            res.innerHTML = `<span style="color:var(--red)">Error: ${data.error}</span>`;
            btn.innerText = 'Try Again';
            btn.disabled = false;
        }
    })
    .catch(err => {
        res.innerHTML = `<span style="color:var(--red)">Network error</span>`;
        btn.innerText = 'Try Again';
        btn.disabled = false;
    });
}
</script>

<?php include __DIR__ . '/_footer.php'; ?>

