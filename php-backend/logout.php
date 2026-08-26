<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/helpers.php';
logout_company();
redirect(BASE_PATH . '/login.php');
