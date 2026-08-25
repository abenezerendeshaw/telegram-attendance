<?php
// ── Authentication helpers for the company dashboard ──────────────────────

require_once __DIR__ . '/db.php';

// Session name to avoid conflicts with other PHP apps on shared hosting
define('SESSION_NAME', 'se_attendance_sess');

function start_session(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_name(SESSION_NAME);
        session_set_cookie_params([
            'lifetime' => 86400 * 7, // 7 days
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

// ── Require company login, redirect if not authenticated ─────────────────
function require_auth(): array {
    start_session();
    if (empty($_SESSION['company_id'])) {
        header('Location: /login.php');
        exit;
    }
    $company = get_company_by_id((int) $_SESSION['company_id']);
    if (!$company || !$company['is_active']) {
        session_destroy();
        header('Location: /login.php?err=suspended');
        exit;
    }
    return $company;
}

// ── Login: verify email + password, set session ──────────────────────────
function login_company(string $email, string $password): bool {
    start_session();
    $stmt = db()->prepare('SELECT * FROM companies WHERE email = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([strtolower(trim($email))]);
    $company = $stmt->fetch();
    if (!$company) return false;
    if (!password_verify($password, $company['password_hash'])) return false;
    $_SESSION['company_id'] = $company['id'];
    $_SESSION['company_slug'] = $company['slug'];
    return true;
}

// ── Logout ────────────────────────────────────────────────────────────────
function logout_company(): void {
    start_session();
    session_unset();
    session_destroy();
}

// ── Super admin auth ─────────────────────────────────────────────────────
define('SUPER_ADMIN_SESSION', 'se_super_sess');

function start_super_session(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_name(SUPER_ADMIN_SESSION);
        session_start();
    }
}

function require_super_auth(): void {
    start_super_session();
    if (empty($_SESSION['super_admin'])) {
        header('Location: /super-admin/login.php');
        exit;
    }
}

function login_super(string $username, string $password): bool {
    start_super_session();
    $stmt = db()->prepare('SELECT * FROM super_admin WHERE username = ? LIMIT 1');
    $stmt->execute([trim($username)]);
    $admin = $stmt->fetch();
    if (!$admin) return false;
    if (!password_verify($password, $admin['password_hash'])) return false;
    $_SESSION['super_admin'] = true;
    $_SESSION['super_username'] = $admin['username'];
    return true;
}
