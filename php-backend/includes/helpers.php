<?php
// ── General Utility Helpers ───────────────────────────────────────────────

// Subdirectory the app is deployed under (include leading slash, NO trailing slash)
// Change this to '' if you move to the domain root.
define('BASE_PATH', '/evaluation');
define('BASE_URL',  'https://specificethiopian.com' . BASE_PATH);

// Generate a URL-safe slug from a string
function slugify(string $text): string {
    $text = mb_strtolower(trim($text));
    $text = preg_replace('/[^a-z0-9\s-]/', '', $text);
    $text = preg_replace('/[\s_]+/', '-', $text);
    $text = preg_replace('/-+/', '-', $text);
    return trim($text, '-');
}

// Ensure slug is unique in companies table
function unique_slug(string $base): string {
    require_once __DIR__ . '/db.php';
    $slug = slugify($base);
    $candidate = $slug;
    $i = 2;
    while (true) {
        $stmt = db()->prepare('SELECT id FROM companies WHERE slug = ? LIMIT 1');
        $stmt->execute([$candidate]);
        if (!$stmt->fetch()) break;
        $candidate = $slug . '-' . $i++;
    }
    return $candidate;
}

// Set CORS headers for API endpoints (allow Vercel frontend)
function set_cors(): void {
    $allowed = [
        'https://global-attendace.vercel.app',
        'https://telegram-attendance-dzbz.vercel.app',
        'https://specificethiopian.com',
        'http://specificethiopian.com',
        'https://www.specificethiopian.com',
        'http://www.specificethiopian.com',
        'http://localhost:5173',
        'http://localhost:3000',
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin && (in_array($origin, $allowed, true) || preg_match('/^https?:\/\/(?:[a-z0-9-]+\.)*specificethiopian\.com$/i', $origin))) {
        header("Access-Control-Allow-Origin: {$origin}");
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Credentials: true');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// JSON response helper
function json_out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Read JSON body (for POST requests from React)
function json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

// Get required string from body/query
function param(string $key, array $body = [], string $default = ''): string {
    return trim($body[$key] ?? $_GET[$key] ?? $_POST[$key] ?? $default);
}

// Generate a cryptographically random token
function random_token(int $bytes = 32): string {
    return bin2hex(random_bytes($bytes));
}

// Hash password
function hash_password(string $password): string {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

// Validate email
function valid_email(string $email): bool {
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

// Sanitize for HTML output
function e(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

// Human-readable label for a company's member type
function member_type_label(string $type, bool $plural = false): string {
    return match ($type) {
        'employee' => $plural ? 'Employees' : 'Employee',
        'both'     => $plural ? 'Students & Employees' : 'Students & Employees',
        default    => $plural ? 'Students' : 'Student',
    };
}

// Resolve a comma/checkbox member type value to a single valid value
function resolve_member_type(array $selected): string {
    $types = [];
    foreach ($selected as $t) {
        if (in_array($t, ['student', 'employee'], true)) $types[$t] = true;
    }
    $count = count($types);
    if ($count >= 2) return 'both';
    return $types['employee'] ?? 'student';
}

// Format bytes to human-readable
function format_bytes(int $bytes): string {
    if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' MB';
    if ($bytes >= 1024)    return round($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}

// Check if request method is POST
function is_post(): bool {
    return $_SERVER['REQUEST_METHOD'] === 'POST';
}

// Redirect
function redirect(string $url): never {
    header("Location: {$url}");
    exit;
}

// Flash messages (for dashboard forms)
function flash_set(string $type, string $msg): void {
    require_once __DIR__ . '/auth.php';
    start_session();
    $_SESSION['flash'] = ['type' => $type, 'msg' => $msg];
}

function flash_get(): ?array {
    require_once __DIR__ . '/auth.php';
    start_session();
    if (!isset($_SESSION['flash'])) return null;
    $flash = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return $flash;
}
