<?php
// POST /api/test-sheet.php
// Runs a full Google Sheets connection diagnostic for the logged-in company.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/sheets.php';

set_cors();

start_session();
if (empty($_SESSION['company_id'])) {
    json_out(['error' => 'Unauthorized. Please log in again.'], 401);
}
$company = get_company_by_id((int) $_SESSION['company_id']);
if (!$company || !$company['is_active']) {
    json_out(['error' => 'Account suspended or not found.'], 403);
}

$sheetId = trim($company['google_sheet_id'] ?? '');
$jsonStr = trim($company['google_service_account_json'] ?? '');

if (!$sheetId) {
    json_out(['error' => 'No Google Sheet ID saved. Save the integration first.'], 400);
}
if (!$jsonStr) {
    json_out(['error' => 'No service account JSON saved. Save the integration first.'], 400);
}

$creds = parse_service_account($jsonStr);
if (!$creds) {
    json_out(['error' => 'The saved service account JSON is invalid.'], 400);
}

$report = sheets_diagnose($creds, $sheetId);

if (!$report['ok']) {
    json_out([
        'success' => false,
        'steps'   => $report['steps'],
        'tabs'    => $report['tabs'],
        'error'   => $report['error'],
    ], 400);
}

// Connection works — try to ensure the configured tab exists
$tab = trim($company['google_sheet_tab'] ?? $company['name']);
$ensure = sheets_ensure_tab($creds, $sheetId, $tab);

json_out([
    'success' => true,
    'steps'   => $report['steps'],
    'tabs'    => $report['tabs'],
    'tab'     => $tab,
    'tabCreated' => !empty($ensure['created']),
    'tabExists'  => !empty($ensure['exists']),
    'message' => 'Connection OK. Sheet tabs found: ' . (count($report['tabs']) ? implode(', ', $report['tabs']) : '(none)'),
]);
