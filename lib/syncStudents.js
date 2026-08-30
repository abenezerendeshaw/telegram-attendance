// lib/syncStudents.js
// Smart sync: Google Sheet is primary, students.js is a backup.
//
// Rules:
//   1. If a student in students.js is NOT on the sheet (by Amharic name)  → append them.
//   2. If a student IS on the sheet with the same Amharic name but a
//      different English name                                              → update col B only.
//   3. Students already on the sheet but NOT in students.js are left alone
//      (manual additions survive).
//   4. No row is ever deleted or the whole sheet overwritten.

import { STUDENTS } from "../src/students.js";

/**
 * Ensure the "Students" tab exists; if not, create it with a header row.
 * Returns the sheets client for reuse.
 */
async function ensureStudentsTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);

  if (!existingTabs.includes("Students")) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: "Students" } } }],
      },
    });
    // Write header row on fresh tab
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Students!A1:C1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["name", "englishName", "group"]] },
    });
    console.log("[syncStudents] Created Students tab with header row");
    return true; // tab is brand-new, caller should do a full seed if desired
  }
  return false; // tab already existed
}

/**
 * Main export: call this from init.js and submit.js.
 *
 * @param {object} sheets   - googleapis sheets client
 * @param {string} spreadsheetId
 */
export async function syncStudentsToSheet(sheets, spreadsheetId) {
  try {
    const isNew = await ensureStudentsTab(sheets, spreadsheetId);

    if (isNew) {
      // Tab is brand-new — seed it completely from students.js
      const rows = STUDENTS.map((s) => [s.name || "", s.englishName || "", s.group || ""]);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Students!A:C",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });
      console.log(`[syncStudents] Seeded ${rows.length} students into new tab`);
      return;
    }

    // ── Tab already exists: read current data ────────────────────────────────
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Students!A:C",
    });
    const sheetRows = resp.data.values || [];

    // Build lookup: normalised amharic name → { rowIndex (1-based), englishName }
    // Row 0 is the header ("name", "englishName", "group"), so data starts at index 1.
    const sheetMap = new Map();
    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const amharic = (row[0] || "").trim();
      if (!amharic) continue;
      sheetMap.set(amharic, {
        rowIndex: i + 1,          // 1-based sheet row number
        englishName: (row[1] || "").trim(),
        group: (row[2] || "").trim(),
      });
    }

    const toAppend = [];    // new students to add
    const toUpdate = [];    // { rowIndex, englishName } — English name fixes

    for (const student of STUDENTS) {
      const amharic = (student.name || "").trim();
      const newEnglish = (student.englishName || "").trim();
      const newGroup = (student.group || "").trim();

      if (!amharic) continue;

      if (sheetMap.has(amharic)) {
        const existing = sheetMap.get(amharic);
        if (existing.englishName !== newEnglish) {
          // Same Amharic name, different English name → update col B only
          toUpdate.push({ rowIndex: existing.rowIndex, englishName: newEnglish });
        }
        // If both match, nothing to do
      } else {
        // Not on sheet at all → add
        toAppend.push([amharic, newEnglish, newGroup]);
      }
    }

    // ── Apply English-name updates (individual cell writes) ──────────────────
    for (const { rowIndex, englishName } of toUpdate) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Students!B${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[englishName]] },
      });
      console.log(`[syncStudents] Updated English name at row ${rowIndex} → "${englishName}"`);
    }

    // ── Append brand-new students ────────────────────────────────────────────
    if (toAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Students!A:C",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: toAppend },
      });
      console.log(`[syncStudents] Appended ${toAppend.length} new student(s): ${toAppend.map((r) => r[0]).join(", ")}`);
    }

    if (toUpdate.length === 0 && toAppend.length === 0) {
      console.log("[syncStudents] Students tab is already up to date");
    }
  } catch (e) {
    // Log but don't throw — a sync failure should never block attendance recording
    console.error("[syncStudents] Error:", e.message, e.response?.data || "");
  }
}
