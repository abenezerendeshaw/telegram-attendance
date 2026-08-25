<?php
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/auth.php';

$company = require_auth();
$pageTitle = 'Payment Receipts';

// Pagination
$page = max(1, (int)($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

// Count
$stmt = db()->prepare('SELECT COUNT(*) FROM receipt_uploads WHERE company_id = ?');
$stmt->execute([$company['id']]);
$total = $stmt->fetchColumn();
$totalPages = ceil($total / $limit);

// Fetch
$stmt = db()->prepare('SELECT * FROM receipt_uploads WHERE company_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
$stmt->bindValue(1, $company['id'], PDO::PARAM_INT);
$stmt->bindValue(2, $limit, PDO::PARAM_INT);
$stmt->bindValue(3, $offset, PDO::PARAM_INT);
$stmt->execute();
$receipts = $stmt->fetchAll();

include __DIR__ . '/_header.php';
?>

<div class="content">
  <div class="card-header">
    <div>
      <h2 class="card-title">Payment Receipts</h2>
      <p class="card-subtitle">Receipts uploaded by users via the mini app.</p>
    </div>
    
    <div class="topbar-actions">
      <?php if (!$company['enable_receipt_upload']): ?>
        <span class="badge badge-amber">Uploads Disabled</span>
      <?php else: ?>
        <span class="badge badge-green">Uploads Enabled</span>
      <?php endif; ?>
    </div>
  </div>

  <div class="card p-0">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date / Time</th>
            <th>Payer Name</th>
            <th><?= e(ucfirst($company['member_type'])) ?> Name</th>
            <th>Receipt Image</th>
            <th>Telegram Status</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($receipts as $r): ?>
          <tr>
            <td style="color:var(--text2);font-size:0.85rem">
              <?= date('Y-m-d H:i', strtotime($r['created_at'])) ?>
            </td>
            <td style="font-weight:600"><?= e($r['payer_name']) ?></td>
            <td><?= e($r['student_name']) ?></td>
            <td>
              <a href="/uploads/receipts/<?= e($r['file_path']) ?>" target="_blank" class="btn btn-secondary btn-sm">
                View Receipt
              </a>
            </td>
            <td>
              <?php if ($r['telegram_message_id']): ?>
                <span class="badge badge-green">Sent to Telegram</span>
              <?php else: ?>
                <span class="badge badge-gray">Not Sent</span>
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; if (empty($receipts)): ?>
          <tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text2)">No receipts uploaded yet.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pagination -->
  <?php if ($totalPages > 1): ?>
  <div style="display:flex;justify-content:center;gap:10px;margin-top:24px">
    <?php if ($page > 1): ?>
      <a href="?page=<?= $page - 1 ?>" class="btn btn-secondary">← Previous</a>
    <?php endif; ?>
    <span style="padding:10px;color:var(--text2)">Page <?= $page ?> of <?= $totalPages ?></span>
    <?php if ($page < $totalPages): ?>
      <a href="?page=<?= $page + 1 ?>" class="btn btn-secondary">Next →</a>
    <?php endif; ?>
  </div>
  <?php endif; ?>
</div>

<?php include __DIR__ . '/_footer.php'; ?>
