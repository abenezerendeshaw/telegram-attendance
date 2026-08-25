<?php
// ── GET /api/members.php?c=[slug] ─────────────────────────────────────────
// Returns the active member list for the React attendance form.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';

set_cors();

$slug = param('c');
if (!$slug) json_out(['error' => 'Missing company slug'], 400);

$company = get_company_by_slug($slug);
if (!$company) json_out(['error' => 'Company not found'], 404);

$stmt = db()->prepare(
    'SELECT id, name, english_name, group_name, member_type
     FROM members
     WHERE company_id = ? AND is_active = 1
     ORDER BY group_name, name'
);
$stmt->execute([$company['id']]);
$rows = $stmt->fetchAll();

// Format to match the React app's expected structure
$members = array_map(fn($r) => [
    'id'          => $r['id'],
    'name'        => $r['name'],
    'englishName' => $r['english_name'] ?? '',
    'group'       => $r['group_name'] ?? '',
], $rows);

json_out(['members' => $members]);
