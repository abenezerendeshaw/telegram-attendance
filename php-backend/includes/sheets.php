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

// Append rows to a sheet range
function sheets_append(array $credentials, string $sheetId, string $range, array $values): bool {
    $token = sheets_get_access_token($credentials);
    if (!$token) return false;

    $url  = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$range}:append";
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
    curl_close($ch);
    return $code >= 200 && $code < 300;
}

// Get all rows from a range
function sheets_get(array $credentials, string $sheetId, string $range): array {
    $token = sheets_get_access_token($credentials);
    if (!$token) return [];

    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$range}";
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
function parse_service_account(string $jsonStr): ?array {
    if (!$jsonStr) return null;
    $creds = json_decode($jsonStr, true);
    if (!is_array($creds)) return null;
    // Fix escaped newlines in private key
    if (isset($creds['private_key'])) {
        $creds['private_key'] = str_replace('\\n', "\n", $creds['private_key']);
    }
    return $creds;
}
