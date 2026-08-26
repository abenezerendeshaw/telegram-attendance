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
    'SELECT m.id, m.name, m.english_name, m.group_name, m.member_type,
            b.name AS branch_name, l.name AS level_name
     FROM members m
     LEFT JOIN branches b ON b.id = m.branch_id
     LEFT JOIN levels l ON l.id = m.level_id
     WHERE m.company_id = ? AND m.is_active = 1
     ORDER BY m.group_name, m.name'
);
$stmt->execute([$company['id']]);
$rows = $stmt->fetchAll();

// Format to match the React app's expected structure
$members = array_map(fn($r) => [
    'id'          => $r['id'],
    'name'        => $r['name'],
    'englishName' => $r['english_name'] ?? '',
    'group'       => $r['group_name'] ?? '',
    'branch'      => $r['branch_name'] ?? '',
    'level'       => $r['level_name'] ?? '',
], $rows);

json_out(['members' => $members]);
