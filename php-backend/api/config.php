<?php
// ── GET /api/config.php?c=[slug] ─────────────────────────────────────────
// Returns public company branding + UI configuration for the React frontend.

require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/db.php';

set_cors();

$slug = param('c');
if (!$slug) json_out(['error' => 'Missing company slug (c)'], 400);

$company = get_company_by_slug($slug);
if (!$company) json_out(['error' => 'Company not found'], 404);

json_out([
    'name'                    => $company['name'],
    'slug'                    => $company['slug'],
    'logo'                    => $company['logo_path']
                                 ? 'https://specificethiopian.com/uploads/logos/' . basename($company['logo_path'])
                                 : null,
    'cover'                   => $company['cover_image']
                                 ? 'https://specificethiopian.com/uploads/covers/' . basename($company['cover_image'])
                                 : null,
    'description'             => $company['description'],
    'primaryColor'            => $company['primary_color'] ?? '#d97706',
    'memberType'              => $company['member_type'] ?? 'student',
    'disableGpsCheck'         => (bool)($company['disable_gps_check'] ?? false),
    'allowOftimeSubmission'   => (bool)($company['allow_offtime_submission'] ?? false),
    'allowMultipleSubmissions'=> (bool)($company['allow_multiple_submissions'] ?? false),
    'classLat'                => $company['class_lat'] ? (float)$company['class_lat'] : null,
    'classLng'                => $company['class_lng'] ? (float)$company['class_lng'] : null,
    'maxDistanceMeters'       => (int)($company['max_distance_meters'] ?? 400),
    'attendanceWindowStart'   => $company['attendance_window_start'] ?? '23:30',
    'attendanceWindowEnd'     => $company['attendance_window_end'] ?? '02:30',
    'classDays'               => $company['class_days'] ? array_map('intval', explode(',', $company['class_days'])) : [1,3,5],
    'receiptUploadEnabled'    => (bool)($company['enable_receipt_upload'] ?? false),
]);
