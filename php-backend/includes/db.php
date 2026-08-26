<?php
// ── Database Configuration ─────────────────────────────────────────────────
// Edit these values to match your cPanel MySQL credentials.

define('DB_HOST', 'localhost');
define('DB_NAME', 'specifyu_attendance_hub');   // your cPanel DB name
define('DB_USER', 'root');              // your cPanel DB username
define('DB_PASS', '');                  // your cPanel DB password
define('DB_CHARSET', 'utf8mb4');

// ── PDO Singleton ─────────────────────────────────────────────────────────
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_NAME,
            DB_CHARSET
        );
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            die(json_encode(['error' => 'Database connection failed']));
        }
    }
    return $pdo;
}

// ── Fetch company by slug (cached per request) ────────────────────────────
function get_company_by_slug(string $slug): ?array
{
    static $cache = [];
    if (isset($cache[$slug]))
        return $cache[$slug];
    $stmt = db()->prepare(
        'SELECT c.*, cs.* FROM companies c
         LEFT JOIN company_settings cs ON cs.company_id = c.id
         WHERE c.slug = ? AND c.is_active = 1 LIMIT 1'
    );
    $stmt->execute([$slug]);
    $row = $stmt->fetch() ?: null;
    $cache[$slug] = $row;
    return $row;
}

// ── Fetch company by id ───────────────────────────────────────────────────
function get_company_by_id(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT c.*, cs.* FROM companies c
         LEFT JOIN company_settings cs ON cs.company_id = c.id
         WHERE c.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}
