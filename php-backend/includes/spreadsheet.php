<?php
// ── Minimal CSV / XLSX helpers (no external dependencies) ────────────────
// XLSX support requires the ZipArchive extension (standard on cPanel).

// ── CSV ────────────────────────────────────────────────────────────────────
function csv_read_rows(string $filePath): array {
    $rows = [];
    $fh = @fopen($filePath, 'r');
    if (!$fh) return $rows;
    while (($line = fgetcsv($fh, 0, ',', '"', '\\')) !== false) {
        $rows[] = array_map(fn($c) => trim((string)($c ?? '')), $line);
    }
    fclose($fh);
    return $rows;
}

function csv_write_rows(string $filePath, array $rows): bool {
    $fh = @fopen($filePath, 'w');
    if (!$fh) return false;
    foreach ($rows as $row) {
        fputcsv($fh, array_map('strval', $row));
    }
    fclose($fh);
    return true;
}

// ── XLSX reader (single sheet) ────────────────────────────────────────────
function xlsx_read_rows(string $filePath): array {
    if (!class_exists('ZipArchive')) return [];
    $zip = new ZipArchive();
    if ($zip->open($filePath) !== true) return [];

    $shared = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false) {
        $shared = xlsx_parse_shared_strings($sharedXml);
    }

    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    if ($sheetXml === false) {
        // Fall back to the first worksheet found in the workbook
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbook !== false && $rels !== false) {
            preg_match_all('/<sheet [^>]*name="[^"]*"[^>]*r:id="(rId\d+)"/', $workbook, $wbm);
            preg_match_all('/<Relationship [^>]*Id="(rId\d+)"[^>]*Target="(worksheets\/[^"]+)"/', $rels, $relm);
            $targets = [];
            foreach ($relm[1] as $i => $rid) $targets[$rid] = $relm[2][$i];
            foreach ($wbm[1] as $rid) {
                if (isset($targets[$rid])) {
                    $sheetXml = $zip->getFromName('xl/' . $targets[$rid]);
                    if ($sheetXml !== false) break;
                }
            }
        }
    }
    $zip->close();

    if ($sheetXml === false) return [];
    return xlsx_parse_sheet($sheetXml, $shared);
}

function xlsx_strip_ns(string $xml): string {
    return (string)preg_replace('/xmlns[^=]*="[^"]*"/', '', $xml);
}

function xlsx_parse_shared_strings(string $xml): array {
    $out = [];
    $sx = simplexml_load_string(xlsx_strip_ns($xml));
    if ($sx === false) return $out;
    foreach ($sx->si as $si) {
        $text = '';
        foreach ($si->r as $r) $text .= (string)$r->t;
        if ($text === '' && isset($si->t)) $text = (string)$si->t;
        $out[] = $text;
    }
    return $out;
}

function xlsx_parse_sheet(string $xml, array $shared): array {
    $out = [];
    $sx = simplexml_load_string(xlsx_strip_ns($xml));
    if ($sx === false) return $out;
    foreach ($sx->sheetData->row as $row) {
        $cells = [];
        foreach ($row->c as $c) {
            $col = 0;
            if (preg_match('/^([A-Z]+)/', (string)$c['r'], $m)) {
                $col = xlsx_col_index($m[1]);
            }
            $type = (string)$c['t'];
            $val = '';
            if ($type === 's') {
                $idx = (int)$c->v;
                $val = $shared[$idx] ?? '';
            } elseif ($type === 'inlineStr') {
                foreach ($c->is->t as $t) $val .= (string)$t;
            } elseif ($type === 'b') {
                $val = ((int)$c->v === 1) ? 'true' : 'false';
            } else {
                $val = isset($c->v) ? (string)$c->v : '';
            }
            $cells[$col] = $val;
        }
        if (!$cells) {
            $out[] = [];
            continue;
        }
        $max = max(array_keys($cells));
        $rowArr = [];
        for ($i = 0; $i <= $max; $i++) $rowArr[] = $cells[$i] ?? '';
        $out[] = $rowArr;
    }
    return $out;
}

function xlsx_col_index(string $letters): int {
    $n = 0;
    foreach (str_split(strtoupper($letters)) as $ch) $n = $n * 26 + (ord($ch) - 64);
    return $n - 1;
}

function xlsx_col_letter(int $index): string {
    $letter = '';
    while ($index >= 0) {
        $letter = chr(65 + ($index % 26)) . $letter;
        $index = intdiv($index, 26) - 1;
    }
    return $letter;
}

// ── XLSX writer (single sheet, shared strings) ────────────────────────────
function xlsx_write_rows(string $filePath, array $rows): bool {
    if (!class_exists('ZipArchive')) return false;

    $shared = [];
    $sheetCells = [];
    foreach ($rows as $ri => $row) {
        foreach (array_values($row) as $ci => $val) {
            $text = (string)$val;
            if (!isset($shared[$text])) $shared[$text] = count($shared);
            $sheetCells[$ri][$ci] = $shared[$text];
        }
    }

    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        . '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        . '</Types>';

    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        . '</Relationships>';

    $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheets><sheet name="Members" sheetId="1" r:id="rId1"/></sheets></workbook>';

    $wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        . '</Relationships>';

    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        . '<borders count="1"><border/></borders>'
        . '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
        . '<cellXfs count="1"><xf/></cellXfs>'
        . '</styleSheet>';

    $sharedXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' . count($shared) . '" uniqueCount="' . count($shared) . '">';
    foreach ($shared as $s) {
        $sharedXml .= '<si><t xml:space="preserve">' . htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</t></si>';
    }
    $sharedXml .= '</sst>';

    $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    foreach ($sheetCells as $ri => $cells) {
        $sheetXml .= '<row r="' . ($ri + 1) . '">';
        foreach ($cells as $ci => $sid) {
            $ref = xlsx_col_letter($ci) . ($ri + 1);
            $sheetXml .= '<c r="' . $ref . '" t="s"><v>' . $sid . '</v></c>';
        }
        $sheetXml .= '</row>';
    }
    $sheetXml .= '</sheetData></worksheet>';

    $zip = new ZipArchive();
    if ($zip->open($filePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) return false;
    $zip->addFromString('[Content_Types].xml', $contentTypes);
    $zip->addFromString('_rels/.rels', $rels);
    $zip->addFromString('xl/workbook.xml', $wb);
    $zip->addFromString('xl/_rels/workbook.xml.rels', $wbRels);
    $zip->addFromString('xl/worksheets/sheet1.xml', $sheetXml);
    $zip->addFromString('xl/sharedStrings.xml', $sharedXml);
    $zip->addFromString('xl/styles.xml', $styles);
    $zip->close();
    return true;
}
