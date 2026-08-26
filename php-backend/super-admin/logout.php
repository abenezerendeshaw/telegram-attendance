<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/helpers.php';
logout_superadmin();
redirect(BASE_PATH . '/super-admin/login.php');
