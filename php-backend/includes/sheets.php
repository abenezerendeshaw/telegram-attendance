<?php
// ── Google Sheets API via Service Account (pure PHP, no Composer) ─────────
// Uses RS256 JWT + OAuth2 token exchange, then Sheets REST API via cURL

function sheets_get_access_token(array $credentials): ?string {
    $now       = time();
    $exp       = $now + 3600;
    $scope     = 'https://www.googleapis.com/auth/spreadsheets';
    $tokenUri  = $credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token';
    $email     = $credentials['client_email'] ?? '';
    $privateKey = $credentials['private_key'] ?? '';

    if (!$email || !$privateKey) return null;

    // Build JWT
    $header  = base64url_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode([
        'iss'   => $email,
        'scope' => $scope,
        'aud'   => $tokenUri,
        'exp'   => $exp,
        'iat'   => $now,
    ]));

    $signing = "{$header}.{$payload}";
    $sig     = '';

    // Fix newlines in private key
    $pkey = str_replace('\\n', "\n", $privateKey);
    $pkeyId = openssl_pkey_get_private($pkey);
    if (!$pkeyId) return null;
    openssl_sign($signing, $sig, $pkeyId, 'sha256WithRSAEncryption');
    $jwt = $signing . '.' . base64url_encode($sig);

    // Exchange JWT for access token
    $ch = curl_init($tokenUri);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    if (!$resp) return null;
    $data = json_decode($resp, true);
    return $data['access_token'] ?? null;
}

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// Append rows to a sheet range.
// Returns [ 'ok' => bool, 'error' => string ] with the real error for debugging.
function sheets_append(array $credentials, string $sheetId, string $range, array $values): array {
    $token = sheets_get_access_token($credentials);
    if (!$token) return ['ok' => false, 'error' => 'Could not obtain access token'];

    $encodedRange = rawurlencode($range);
    $url  = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$encodedRange}:append";
    $url .= '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';

    $body = json_encode(['values' => $values]);
    $ch   = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'POST',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer {$token}",
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($code >= 200 && $code < 300) {
        return ['ok' => true, 'error' => ''];
    }
    $bodyArr = $resp ? json_decode($resp, true) : null;
    $apiErr  = $bodyArr['error']['message'] ?? $resp;
    return ['ok' => false, 'error' => "HTTP {$code}: {$apiErr}" . ($cerr ? " | cURL: {$cerr}" : '')];
}

// Get all rows from a range
function sheets_get(array $credentials, string $sheetId, string $range): array {
    $token = sheets_get_access_token($credentials);
    if (!$token) return [];

    $encodedRange = rawurlencode($range);
    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$encodedRange}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer {$token}"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    if (!$resp) return [];
    $data = json_decode($resp, true);
    return $data['values'] ?? [];
}

// Helper: parse the service account JSON stored in DB
// Accepts both standard JSON AND dotenv-style key:value,key:value format
// (the latter is used by some Vercel .env.local exports)
function parse_service_account(string $jsonStr): ?array {
    if (!$jsonStr) return null;

    // Try standard JSON first
    $creds = json_decode($jsonStr, true);
    if (is_array($creds)) {
        if (isset($creds['private_key'])) {
            $creds['private_key'] = str_replace('\\n', "\n", $creds['private_key']);
        }
        return $creds;
    }

    // Fallback: dotenv-style {key:value,key:value,...}
    $trimmed = trim($jsonStr);
    // Strip surrounding quotes (common when copied from .env files)
    if (strlen($trimmed) >= 2 && $trimmed[0] === '"' && $trimmed[-1] === '"') {
        $trimmed = substr($trimmed, 1, -1);
    }
    if (str_starts_with($trimmed, '{') && str_ends_with($trimmed, '}')) {
        $inner = substr($trimmed, 1, -1);
        $pairs = explode(',', $inner);
        $creds = [];
        foreach ($pairs as $pair) {
            $pair = trim($pair);
            $colonPos = strpos($pair, ':');
            if ($colonPos === false) continue;
            $key   = trim(substr($pair, 0, $colonPos));
            $value = trim(substr($pair, $colonPos + 1));
            // Unquote if wrapped in quotes
            if (strlen($value) >= 2 && $value[0] === '"' && $value[-1] === '"') {
                $value = substr($value, 1, -1);
            }
            // Replace escaped newlines (handle both \n and \\n sequences)
            $value = str_replace('\\\\n', "\n", $value);
            $value = str_replace('\\n', "\n", $value);
            $creds[$key] = $value;
        }
        // Validate required fields
        if (!empty($creds['client_email']) && !empty($creds['private_key'])) {
            return $creds;
        }
    }

    return null;
}

// List existing sheet (tab) titles inside a spreadsheet
function sheets_list_tabs(array $credentials, string $sheetId): array {
    $token = sheets_get_access_token($credentials);
    if (!$token) return [];
    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}?fields=sheets.properties.title";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer {$token}"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    if (!$resp) return [];
    $data = json_decode($resp, true);
    $tabs = [];
    foreach ($data['sheets'] ?? [] as $s) {
        if (!empty($s['properties']['title'])) $tabs[] = $s['properties']['title'];
    }
    return $tabs;
}

// Create a new sheet (tab) inside a spreadsheet if it doesn't exist.
// Returns [ 'created' => bool, 'exists' => bool ]
function sheets_ensure_tab(array $credentials, string $sheetId, string $tabName): array {
    $tabs = sheets_list_tabs($credentials, $sheetId);
    if (in_array($tabName, $tabs, true)) {
        return ['created' => false, 'exists' => true];
    }

    $token = sheets_get_access_token($credentials);
    if (!$token) return ['created' => false, 'exists' => false];

    $url  = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}:batchUpdate";
    $body = json_encode([
        'requests' => [
            ['addSheet' => ['properties' => ['title' => $tabName]]],
        ],
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'POST',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer {$token}",
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['created' => $code >= 200 && $code < 300, 'exists' => $code >= 200 && $code < 300];
}

// Make a tab-safe sheet range name (quote if it has spaces/special chars)
function sheets_range(string $tabName, string $range): string {
    $tabName = trim($tabName);
    $needsQuote = preg_match('/[\s\'"!]/', $tabName);
    return ($needsQuote ? "'" . str_replace("'", "''", $tabName) . "'" : $tabName) . '!' . $range;
}

// Convert a 0-based column index to a sheet column letter (0 -> A, 25 -> Z, 26 -> AA)
function sheets_col_letter(int $index): string {
    $letter = '';
    while ($index >= 0) {
        $letter = chr(65 + ($index % 26)) . $letter;
        $index = intdiv($index, 26) - 1;
    }
    return $letter;
}

// Write raw values to a range (PUT values:update)
function sheets_set_values(array $credentials, string $sheetId, string $range, array $values): array {
    $token = sheets_get_access_token($credentials);
    if (!$token) return ['ok' => false, 'error' => 'Could not obtain access token'];

    $encodedRange = rawurlencode($range);
    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$encodedRange}?valueInputOption=USER_ENTERED";
    $body = json_encode(['values' => $values]);
    $ch   = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer {$token}",
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($code >= 200 && $code < 300) return ['ok' => true, 'error' => ''];
    $bodyArr = $resp ? json_decode($resp, true) : null;
    return ['ok' => false, 'error' => "HTTP {$code}: " . ($bodyArr['error']['message'] ?? $resp) . ($cerr ? " | cURL: {$cerr}" : '')];
}

// ── Daily-column matrix writer ────────────────────────────────────────────
// Layout (rows = members, one column per date):
//   Columns: ስም (Amharic) | English Name | Group/Level | Branch | [Date] [Date] ...
// Each day gets its own new column (appended when the date isn't found yet).
// A mark (✓ / P) is placed in the member's row under that day's column.
// Existing date columns are never removed or overwritten.
function sheets_mark_daily_cell(array $credentials, string $sheetId, string $tab,
                                array $memberInfo, string $dateLabel, string $mark): array {
    $staticHeaders = ['ስም (Amharic)', 'English Name', 'Group/Level', 'Branches / Locations'];
    $existing = sheets_get($credentials, $sheetId, sheets_range($tab, 'A1:ZZ2000'));
    $header   = $existing[0] ?? [];
    $rows     = array_slice($existing, 1);

    // Trim trailing empty cells from the header row
    while (count($header) && trim((string)end($header)) === '') array_pop($header);

    // ── Ensure the static columns exist (A..D), keeping any extra columns ──
    $first4 = array_map(fn($h) => trim((string)$h), array_slice($header, 0, 4));
    if (count($header) < 4 || $first4 !== $staticHeaders) {
        $newHeader = array_merge($staticHeaders, array_slice($header, 4));
        $r = sheets_set_values($credentials, $sheetId,
            sheets_range($tab, 'A1:' . sheets_col_letter(count($newHeader) - 1) . '1'),
            [$newHeader]);
        if (!$r['ok']) return $r;
        $header = $newHeader;
    }

    // ── Find the date column; append a new one if today is not present ─────
    $dateCol = array_search($dateLabel, $header, true);
    if ($dateCol === false) {
        $dateCol = count($header);
        $header[] = $dateLabel;
        $r = sheets_set_values($credentials, $sheetId,
            sheets_range($tab, sheets_col_letter($dateCol) . '1'), [[$dateLabel]]);
        if (!$r['ok']) return $r;
    }

    // ── Find the member row by Amharic name or English name ────────────────
    $rowIdx = null;
    foreach ($rows as $i => $r) {
        $a = trim((string)($r[0] ?? ''));
        $b = trim((string)($r[1] ?? ''));
        if ($a === $memberInfo['amharic'] || ($memberInfo['english'] !== '' && $b === $memberInfo['english'])) {
            $rowIdx = $i + 2; // 1-based sheet row, skip header row
            break;
        }
    }
    if ($rowIdx === null) {
        $rowIdx = count($rows) + 2;
        $r = sheets_set_values($credentials, $sheetId,
            sheets_range($tab, 'A' . $rowIdx . ':D' . $rowIdx),
            [[$memberInfo['amharic'], $memberInfo['english'], $memberInfo['group'], $memberInfo['branch']]]);
        if (!$r['ok']) return $r;
    }

    // ── Write the ✓ / P into the date cell for this member ────────────────
    return sheets_set_values($credentials, $sheetId,
        sheets_range($tab, sheets_col_letter($dateCol) . $rowIdx), [[$mark]]);
}

// Mark attendance: ✓ for present, P for permission (daily-column layout)
function sheets_mark_attendance(array $credentials, string $sheetId, string $tab,
                                array $memberInfo, string $dateLabel, string $mark): array {
    return sheets_mark_daily_cell($credentials, $sheetId, $tab, $memberInfo, $dateLabel, $mark);
}

// Mark a receipt for a member (daily-column layout, same as attendance)
function sheets_mark_receipt(array $credentials, string $sheetId, string $tab,
                             array $memberInfo, string $dateLabel): array {
    return sheets_mark_daily_cell($credentials, $sheetId, $tab, $memberInfo, $dateLabel, '💳');
}

// Ensure the static headers exist in the sheet (for Test Connection).
function sheets_ensure_headers(array $credentials, string $sheetId, string $tab): array {
    $staticHeaders = ['ስም (Amharic)', 'English Name', 'Group/Level', 'Branches / Locations'];
    $existing = sheets_get($credentials, $sheetId, sheets_range($tab, 'A1:D1'));
    $header = $existing[0] ?? [];
    $needsFix = false;
    for ($i = 0; $i < count($staticHeaders); $i++) {
        if (trim((string)($header[$i] ?? '')) !== $staticHeaders[$i]) {
            $needsFix = true;
            break;
        }
    }
    if ($needsFix) {
        return sheets_set_values($credentials, $sheetId,
            sheets_range($tab, 'A1:D1'), [$staticHeaders]);
    }
    return ['ok' => true, 'error' => ''];
}

// ── Diagnostics: run each step and return the real error ──────────────────
// Returns [ 'ok' => bool, 'steps' => [...], 'tabs' => [], 'error' => string ]
function sheets_diagnose(array $credentials, string $sheetId): array {
    $report = ['ok' => false, 'steps' => [], 'tabs' => [], 'error' => ''];

    // Step 1: validate credentials JSON
    $email = $credentials['client_email'] ?? '';
    $key   = $credentials['private_key'] ?? '';
    if (!$email || !$key) {
        $report['error'] = 'Service account JSON is missing client_email or private_key.';
        return $report;
    }
    $report['steps'][] = 'Credentials found (client_email: ' . $email . ')';

    // Step 2: openssl available?
    if (!function_exists('openssl_pkey_get_private')) {
        $report['error'] = 'PHP openssl extension is not enabled on this server.';
        return $report;
    }

    // Step 3: parse private key
    $pkey = str_replace('\\n', "\n", $key);
    $pkeyId = @openssl_pkey_get_private($pkey);
    if (!$pkeyId) {
        $report['error'] = 'Could not parse the private key. Make sure the JSON private_key is complete and begins with "-----BEGIN PRIVATE KEY-----".';
        return $report;
    }
    $report['steps'][] = 'Private key parsed successfully';

    // Step 4: get access token
    $token = sheets_get_access_token($credentials);
    if (!$token) {
        $report['error'] = 'Could not obtain an access token. Check the token_uri and that the service account is active.';
        return $report;
    }
    $report['steps'][] = 'Access token obtained';

    // Step 5: read the spreadsheet
    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}?fields=sheets.properties.title";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer {$token}"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($code !== 200) {
        $body = $resp ? json_decode($resp, true) : null;
        $apiErr = $body['error']['message'] ?? ($body['error']['status'] ?? $resp);
        if ($code === 403) {
            $report['error'] = 'PERMISSION DENIED: Share the Google Sheet with ' . $email . ' (Editor access).';
        } elseif ($code === 404) {
            $report['error'] = 'Sheet not found. Double-check the Google Sheet ID.';
        } else {
            $report['error'] = 'Google API error (' . $code . '): ' . $apiErr . ($cerr ? ' | cURL: ' . $cerr : '');
        }
        return $report;
    }
    $report['steps'][] = 'Spreadsheet accessed (' . $code . ')';

    $data = json_decode($resp, true);
    foreach ($data['sheets'] ?? [] as $s) {
        if (!empty($s['properties']['title'])) $report['tabs'][] = $s['properties']['title'];
    }
    $report['ok'] = true;
    return $report;
}
