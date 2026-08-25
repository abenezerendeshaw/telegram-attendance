<?php
// ── Ethiopian Date / Time Helpers ─────────────────────────────────────────

function get_ethiopian_date(DateTime $date = null): string {
    if ($date === null) $date = new DateTime('now', new DateTimeZone('Africa/Addis_Ababa'));

    $MONTHS = ['መስከረም','ጥቅምት','ኅዳር','ታኅሣሥ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ'];
    $DAYS   = ['እሑድ','ሰኞ','ማክሰኞ','ረቡዕ','ሐሙስ','ዓርብ','ቅዳሜ'];

    $year  = (int) $date->format('Y');
    $month = (int) $date->format('n');
    $day   = (int) $date->format('j');

    $isLeap     = ($year % 4 === 0 && $year % 100 !== 0) || $year % 400 === 0;
    $newYearDay = $isLeap ? 12 : 11;
    $afterNew   = $month > 9 || ($month === 9 && $day >= $newYearDay);
    $ethYear    = $afterNew ? $year - 7 : $year - 8;

    $gMonths = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    if ($isLeap) $gMonths[2] = 29;

    $dayOfYear = $day;
    for ($m = 1; $m < $month; $m++) $dayOfYear += $gMonths[$m];

    $sep11 = $isLeap ? 255 : 254;

    if ($dayOfYear >= $sep11) {
        $diff     = $dayOfYear - $sep11;
        $ethMonth = (int)($diff / 30) + 1;
        $ethDay   = ($diff % 30) + 1;
    } else {
        $prevLeap    = (($year-1) % 4 === 0 && ($year-1) % 100 !== 0) || ($year-1) % 400 === 0;
        $prevDays    = $prevLeap ? 366 : 365;
        $diff        = $dayOfYear + $prevDays - $sep11;
        $ethMonth    = (int)($diff / 30) + 1;
        $ethDay      = ($diff % 30) + 1;
    }

    $dow       = (int) $date->format('w'); // 0=Sun
    $dayName   = $DAYS[$dow];
    $monthName = $MONTHS[min($ethMonth - 1, 12)];

    return "{$dayName}፣ {$monthName} {$ethDay} ቀን {$ethYear} ዓ.ም";
}

function get_ethiopian_time(DateTime $date = null): string {
    if ($date === null) $date = new DateTime('now', new DateTimeZone('Africa/Addis_Ababa'));

    $eatHour   = (int) $date->format('G');  // 0-23
    $eatMinute = (int) $date->format('i');

    // Ethiopian clock starts at 6 AM (dawn = hour 0)
    $ethHour   = (($eatHour - 6 + 24) % 12) ?: 12;
    $period    = ($eatHour >= 6 && $eatHour < 18) ? 'ቀን' : 'ማታ';
    $minStr    = str_pad($eatMinute, 2, '0', STR_PAD_LEFT);

    return "{$ethHour}:{$minStr} {$period}";
}

// Returns EAT DateTime
function eat_now(): DateTime {
    return new DateTime('now', new DateTimeZone('Africa/Addis_Ababa'));
}
