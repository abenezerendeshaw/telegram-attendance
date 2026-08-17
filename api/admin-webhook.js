// api/admin-webhook.js
// Admin Telegram Bot — no time/GPS/submission restrictions
// Supports: /start, /today, /absent, /present, /permission, /group, /stats, /search, /announce, /bypass, /help

import axios from "axios";
import { google } from "googleapis";
import { STUDENTS, GROUPS } from "../src/students.js";

// ─── Auth helpers ────────────────────────────────────────────────────────────

function getAdminIds() {
  const raw = process.env.ADMIN_BOT_ADMINS || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function isAdmin(userId) {
  const admins = getAdminIds();
  // If no admins configured, allow all (open mode — useful for initial setup)
  if (admins.length === 0) return true;
  return admins.includes(String(userId));
}

// ─── Ethiopian date helpers ───────────────────────────────────────────────────

function getEthiopianDate(date = new Date()) {
  const ETHIOPIAN_MONTHS = [
    "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ",
  ];
  const ETHIOPIAN_DAYS = [
    "እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ",
  ];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const isGregorianLeap =
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const ethNewYearDay = isGregorianLeap ? 12 : 11;
  const afterNewYear =
    month > 9 || (month === 9 && day >= ethNewYearDay);
  const ethYear = afterNewYear ? year - 7 : year - 8;

  const gregorianMonths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (isGregorianLeap) gregorianMonths[2] = 29;

  let dayOfYear = day;
  for (let m = 1; m < month; m++) dayOfYear += gregorianMonths[m];

  const sep11 = isGregorianLeap ? 255 : 254;

  let ethMonth, ethDay;
  if (dayOfYear >= sep11) {
    const diff = dayOfYear - sep11;
    ethMonth = Math.floor(diff / 30) + 1;
    ethDay = (diff % 30) + 1;
  } else {
    const prevLeap =
      ((year - 1) % 4 === 0 && (year - 1) % 100 !== 0) ||
      (year - 1) % 400 === 0;
    const prevYearDays = prevLeap ? 366 : 365;
    const diff = dayOfYear + prevYearDays - sep11;
    ethMonth = Math.floor(diff / 30) + 1;
    ethDay = (diff % 30) + 1;
  }

  const dayOfWeek = ETHIOPIAN_DAYS[date.getDay()];
  const monthName =
    ETHIOPIAN_MONTHS[Math.min(ethMonth - 1, 12)] || "መስከረም";

  return `${dayOfWeek}፣ ${monthName} ${ethDay} ቀን ${ethYear} ዓ.ም`;
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function getSheetsClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

  const credentials = JSON.parse(credentialsJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getAllRows() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A:E",
  });
  return response.data.values || [];
}

// Returns today's Ethiopian date string using EAT (UTC+3)
function getEthiopianToday() {
  const now = new Date();
  const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return getEthiopianDate(eatDate);
}

// Sheet stores names as "አማርኛ ስም (english name)" — strip the English part
// so it matches s.name from students.js
function normalizeName(rawName) {
  return (rawName || "").replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
}

async function getStudentRoster() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson || !sheetId) {
    return STUDENTS;
  }

  try {
    const credentials = JSON.parse(credentialsJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Students!A:C",
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      return STUDENTS;
    }

    const roster = rows.slice(1).flatMap(([name, englishName = "", group = ""]) => {
      const studentName = (name || "").trim();
      if (!studentName) return [];
      return [{
        name: studentName,
        englishName: (englishName || "").trim(),
        group: (group || "").trim(),
      }];
    });

    return roster.length > 0 ? roster : STUDENTS;
  } catch (error) {
    console.warn("[AdminBot] Failed to load Students sheet roster, falling back to src/students.js:", error.message);
    return STUDENTS;
  }
}

// Reads rows for the LATEST date that has data in the sheet.
// Returns { rows, date } where date is the Ethiopian date string used.
async function getLatestRowsFromSheet() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title,index))",
    });
    const tabs = (meta.data.sheets || []).map((s) => s.properties.title);

    // Daily tabs are Ethiopian date strings — pick the last one (highest index)
    // Skip Sheet1 itself and any non-date tabs
    const dateTabs = tabs.filter((t) => t !== "Sheet1" && t.trim().length > 0);

    if (dateTabs.length > 0) {
      // Walk backwards from the last tab to find one with actual data
      for (let i = dateTabs.length - 1; i >= 0; i--) {
        const dailyResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'${dateTabs[i]}'!A:E`,
        });
        const dailyRows = dailyResponse.data.values || [];
        const rows = dailyRows.length > 1 ? dailyRows.slice(1) : [];
        if (rows.length > 0) {
          return { rows, date: dateTabs[i] };
        }
      }
    }
  } catch (_) {
    // fall through to Sheet1 filter
  }

  // Fallback: find the latest date in Sheet1 by date column (col D, index 3)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A:E",
  });
  const allRows = response.data.values || [];

  // Collect all unique dates present in the data
  const dates = [...new Set(allRows.map((r) => r[3]).filter(Boolean))];

  if (dates.length === 0) {
    return { rows: [], date: getEthiopianToday() };
  }

  // The last unique date in the sheet is the most recent one
  const latestDate = dates[dates.length - 1];
  const rows = allRows.filter((row) => row[3] === latestDate);
  return { rows, date: latestDate };
}

// ─── Telegram send helper ─────────────────────────────────────────────────────

async function sendMessage(token, chatId, text, extra = {}) {
  const LIMIT = 4000;
  const chunks = [];

  if (text.length <= LIMIT) {
    chunks.push(text);
  } else {
    const lines = text.split("\n");
    let current = "";
    for (const line of lines) {
      if (current.length + line.length + 1 > LIMIT) {
        chunks.push(current);
        current = "";
      }
      current += line + "\n";
    }
    if (current.trim()) chunks.push(current);
  }

  for (const chunk of chunks) {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text: chunk, parse_mode: "Markdown", ...extra }
    );
  }
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleHelp(token, chatId) {
  const help = `
🛠 *የአስተዳዳሪ ቦት ትዕዛዞች*

/submit — አቴንዳንስ መዝግብ (ምንም ገደብ የለም)
/today — የዛሬ ሙሉ ማጠቃለያ (ተገኙ / ፈቃድ / ቀሩ)
/present — ዛሬ የተገኙ ተማሪዎች ዝርዝር
/permission — ዛሬ ፈቃድ የጠየቁ ዝርዝር
/absent — ዛሬ የቀሩ ዝርዝር
/group 1 — ለቡድን 1 የዛሬ ሁኔታ (1-4)
/stats — ከጉግል ሺት ጠቅላላ ስታቲስቲክስ
/search ሙሉ ስም — የተማሪ ታሪካዊ መዝገብ
/announce መልዕክት — ለዋና ቻናሉ መልዕክት ላክ
/bypass — ዛሬውን የክሮን ሪፖርት አሁኑኑ ላክ
/help — ይህን ዝርዝር አሳይ
  `.trim();
  await sendMessage(token, chatId, help);
}

async function handleToday(token, chatId) {
  const { rows: todayRows, date: latestDate } = await getLatestRowsFromSheet();
  const students = await getStudentRoster();

  const presentNames = new Set();
  const permissionNames = new Set();

  for (const row of todayRows) {
    const name = normalizeName(row[0]);
    const status = (row[2] || "").trim();
    if (status.includes("ተገኝቷል")) {
      presentNames.add(name);
    } else {
      permissionNames.add(name);
    }
  }

  const presentList = students.filter((s) =>
    presentNames.has(s.name.trim().toLowerCase())
  );
  const permissionList = students.filter((s) =>
    permissionNames.has(s.name.trim().toLowerCase())
  );
  const absentList = students.filter(
    (s) =>
      !presentNames.has(s.name.trim().toLowerCase()) &&
      !permissionNames.has(s.name.trim().toLowerCase())
  );

  const total = students.length;

  let msg =
    `📊 *የቅርብ ቀን ማጠቃለያ — ${latestDate}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ ተገኙ: *${presentList.length}/${total}*\n` +
    `📝 ፈቃድ: *${permissionList.length}/${total}*\n` +
    `❌ ቀሩ:  *${absentList.length}/${total}*\n\n`;

  // Per-group breakdown
  for (const group of [...new Set(students.map((s) => s.group))]) {
    const gStudents = students.filter((s) => s.group === group);
    const gPresent = gStudents.filter((s) =>
      presentNames.has(s.name.trim().toLowerCase())
    ).length;
    const gPermission = gStudents.filter((s) =>
      permissionNames.has(s.name.trim().toLowerCase())
    ).length;
    const gAbsent = gStudents.length - gPresent - gPermission;
    const shortGroup = group.split(":")[0];
    msg += `📌 *${shortGroup}* — ✅${gPresent} 📝${gPermission} ❌${gAbsent}\n`;
  }

  await sendMessage(token, chatId, msg);
}

async function handlePresent(token, chatId) {
  const { rows: todayRows, date: latestDate } = await getLatestRowsFromSheet();
  const students = await getStudentRoster();

  const presentNames = new Set(
    todayRows
      .filter((r) => (r[2] || "").includes("ተገኝቷል"))
      .map((r) => (r[0] || "").trim().toLowerCase())
  );

  const presentList = students.filter((s) =>
    presentNames.has(s.name.trim().toLowerCase())
  );

  let msg = `✅ *የተገኙ ተማሪዎች — ${latestDate}* (${presentList.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (presentList.length === 0) {
    msg += "⚠️ ማንም አልተገኘም።\n";
  } else {
    presentList.forEach((s, i) => {
      const display = s.englishName
        ? `${s.name} (${s.englishName.trim()})`
        : s.name;
      msg += `${i + 1}. ${display} — ${s.group.split(":")[0]}\n`;
    });
  }

  await sendMessage(token, chatId, msg);
}

async function handlePermission(token, chatId) {
  const { rows: todayRows, date: latestDate } = await getLatestRowsFromSheet();
  const students = await getStudentRoster();

  const permRows = todayRows.filter(
    (r) => !(r[2] || "").includes("ተገኝቷል")
  );
  const permNames = new Set(
    permRows.map((r) => normalizeName(r[0]))
  );

  // Get reasons from sheet rows
  const reasonMap = {};
  for (const row of permRows) {
    const key = normalizeName(row[0]);
    // Column E (index 4) is time — reason is stored in the Telegram message not the sheet
    // We can show the time at least
    reasonMap[key] = row[4] || "";
  }

  const permList = students.filter((s) =>
    permNames.has(s.name.trim().toLowerCase())
  );

  let msg = `📝 *ፈቃድ የጠየቁ ተማሪዎች — ${latestDate}* (${permList.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (permList.length === 0) {
    msg += "✅ ፈቃድ የጠየቀ ተማሪ የለም።\n";
  } else {
    permList.forEach((s, i) => {
      const display = s.englishName
        ? `${s.name} (${s.englishName.trim()})`
        : s.name;
      const time = reasonMap[s.name.trim().toLowerCase()]
        ? ` — ⏰ ${reasonMap[s.name.trim().toLowerCase()]}`
        : "";
      msg += `${i + 1}. ${display} — ${s.group.split(":")[0]}${time}\n`;
    });
  }

  await sendMessage(token, chatId, msg);
}

async function handleAbsent(token, chatId) {
  const { rows: todayRows, date: latestDate } = await getLatestRowsFromSheet();
  const students = await getStudentRoster();

  const submittedNames = new Set(
    todayRows.map((r) => normalizeName(r[0]))
  );

  const absentList = students.filter(
    (s) => !submittedNames.has(s.name.trim().toLowerCase())
  );

  let msg = `❌ *ያልተመዘገቡ ተማሪዎች — ${latestDate}* (${absentList.length}/${students.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (absentList.length === 0) {
    msg += "🎉 ሁሉም ተማሪዎች ተመዝግበዋል!\n";
  } else {
    absentList.forEach((s, i) => {
      const display = s.englishName
        ? `${s.name} (${s.englishName.trim()})`
        : s.name;
      msg += `${i + 1}. ${display} — ${s.group.split(":")[0]}\n`;
    });
  }

  await sendMessage(token, chatId, msg);
}

async function handleGroup(token, chatId, groupNum) {
  const students = await getStudentRoster();
  const groupNames = [...new Set(students.map((s) => s.group).filter(Boolean))];
  const num = parseInt(groupNum, 10);
  if (isNaN(num) || num < 1 || num > groupNames.length) {
    await sendMessage(token, chatId, `❌ ትክክለኛ ቡድን ቁጥር ያስገቡ (1-${groupNames.length})። ምሳሌ: /group 2`);
    return;
  }

  const group = groupNames[num - 1];
  const groupStudents = students.filter((s) => s.group === group);

  const { rows: todayRows, date: latestDate } = await getLatestRowsFromSheet();

  const presentNames = new Set(
    todayRows
      .filter((r) => (r[2] || "").includes("ተገኝቷል"))
      .map((r) => normalizeName(r[0]))
  );
  const permissionNames = new Set(
    todayRows
      .filter((r) => !(r[2] || "").includes("ተገኝቷል"))
      .map((r) => normalizeName(r[0]))
  );

  const present = groupStudents.filter((s) =>
    presentNames.has(s.name.trim().toLowerCase())
  );
  const permission = groupStudents.filter((s) =>
    permissionNames.has(s.name.trim().toLowerCase())
  );
  const absent = groupStudents.filter(
    (s) =>
      !presentNames.has(s.name.trim().toLowerCase()) &&
      !permissionNames.has(s.name.trim().toLowerCase())
  );

  let msg =
    `📌 *${group} — ${latestDate}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ ተገኙ: ${present.length} | 📝 ፈቃድ: ${permission.length} | ❌ ቀሩ: ${absent.length}\n\n`;

  if (present.length > 0) {
    msg += `*✅ ተገኙ:*\n`;
    present.forEach((s, i) => {
      msg += `  ${i + 1}. ${s.name}${s.englishName ? ` (${s.englishName.trim()})` : ""}\n`;
    });
    msg += "\n";
  }

  if (permission.length > 0) {
    msg += `*📝 ፈቃድ:*\n`;
    permission.forEach((s, i) => {
      msg += `  ${i + 1}. ${s.name}${s.englishName ? ` (${s.englishName.trim()})` : ""}\n`;
    });
    msg += "\n";
  }

  if (absent.length > 0) {
    msg += `*❌ ቀሩ:*\n`;
    absent.forEach((s, i) => {
      msg += `  ${i + 1}. ${s.name}${s.englishName ? ` (${s.englishName.trim()})` : ""}\n`;
    });
  }

  await sendMessage(token, chatId, msg);
}

async function handleStats(token, chatId) {
  const rows = await getAllRows();
  const students = await getStudentRoster();
  if (rows.length === 0) {
    await sendMessage(token, chatId, "📊 ምንም መዝገብ አልተገኘም።");
    return;
  }

  // Deduplicate by (normalizedName + date) — keeps last entry per student per day
  // This prevents admin re-submissions from inflating totals
  const seen = new Map();
  for (const row of rows) {
    const key = `${normalizeName(row[0])}__${(row[3] || "").trim()}`;
    seen.set(key, row); // last write wins
  }
  const dedupedRows = Array.from(seen.values());

  const totalRows = dedupedRows.length;
  const presentRows = dedupedRows.filter((r) => (r[2] || "").includes("ተገኝቷል")).length;
  const permissionRows = totalRows - presentRows;

  // Unique class days
  const dates = new Set(dedupedRows.map((r) => r[3]).filter(Boolean));
  const classDays = dates.size;

  // Per-group submission count
  const groupCounts = {};
  for (const group of GROUPS) {
    const shortGroup = group.split(":")[0];
    groupCounts[shortGroup] = { present: 0, permission: 0 };
  }

  for (const row of dedupedRows) {
    const nameKey = normalizeName(row[0]);
    const student = students.find(
      (s) => s.name.trim().toLowerCase() === nameKey
    );
    if (student) {
      const shortGroup = student.group.split(":")[0];
      if (groupCounts[shortGroup]) {
        if ((row[2] || "").includes("ተገኝቷል")) {
          groupCounts[shortGroup].present++;
        } else {
          groupCounts[shortGroup].permission++;
        }
      }
    }
  }

  let msg =
    `📊 *ጠቅላላ ስታቲስቲክስ (Google Sheet)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📅 የተመዘገቡ ቀናት: *${classDays}*\n` +
    `📋 ጠቅላላ ምዝገባ: *${totalRows}*\n` +
    `✅ ተገኙ: *${presentRows}*\n` +
    `📝 ፈቃድ: *${permissionRows}*\n\n` +
    `*በቡድን:*\n`;

  for (const [group, counts] of Object.entries(groupCounts)) {
    msg += `  📌 *${group}*: ✅${counts.present} 📝${counts.permission}\n`;
  }

  await sendMessage(token, chatId, msg);
}

async function handleSearch(token, chatId, query) {
  if (!query || query.trim().length < 2) {
    await sendMessage(
      token,
      chatId,
      "❌ እባክዎ ስምን ያስገቡ። ምሳሌ: /search ሀና ምህረት"
    );
    return;
  }

  const rows = await getAllRows();
  const students = await getStudentRoster();
  const normalizedQuery = query.trim().toLowerCase();

  // Match by Amharic or English name
  const student = students.find(
    (s) =>
      s.name.trim().toLowerCase().includes(normalizedQuery) ||
      (s.englishName &&
        s.englishName.trim().toLowerCase().includes(normalizedQuery))
  );

  const studentName = student ? student.name.trim().toLowerCase() : normalizedQuery;

  const matches = rows.filter((r) =>
    normalizeName(r[0]).includes(studentName)
  );

  if (matches.length === 0) {
    await sendMessage(
      token,
      chatId,
      `🔍 "${query}" ለሚለው ስም ምንም ምዝገባ አልተገኘም።`
    );
    return;
  }

  const displayName = student
    ? `${student.name}${student.englishName ? ` (${student.englishName.trim()})` : ""}`
    : query.trim();

  let msg =
    `🔍 *የ${displayName} ምዝገባ ታሪክ* (${matches.length} ቀናት)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const row of matches) {
    const status = (row[2] || "").includes("ተገኝቷል") ? "✅" : "📝";
    const date = row[3] || "—";
    const time = row[4] || "—";
    msg += `${status} ${date} — ${time}\n`;
  }

  if (student) {
    msg += `\n📌 ቡድን: ${student.group}`;
  }

  await sendMessage(token, chatId, msg);
}

async function handleAnnounce(token, chatId, message) {
  if (!message || message.trim().length === 0) {
    await sendMessage(
      token,
      chatId,
      "❌ መልዕክት ያስገቡ። ምሳሌ: /announce ዛሬ ክፍለ ጊዜ ተሰርዟል"
    );
    return;
  }

  const STUDENT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const fullMsg = `📢 *ከአስተዳዳሪ:*\n\n${message.trim()}`;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: STUDENT_CHAT_ID,
    text: fullMsg,
    parse_mode: "Markdown",
  });

  await sendMessage(token, chatId, `✅ መልዕክቱ ለዋናው ቻናል ተልኳል።`);
}

async function handleBypass(token, chatId, host) {
  // Trigger the cron endpoint internally
  try {
    const baseUrl =
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : host
        ? `https://${host}`
        : "https://telegram-attendance-dzbz.vercel.app";

    const response = await axios.post(
      `${baseUrl}/api/cron`,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
        },
      }
    );

    const { summary } = response.data;
    if (summary) {
      await sendMessage(
        token,
        chatId,
        `✅ *ሪፖርቱ ተልኳል!*\n✅ ተገኙ: ${summary.presents}\n📝 ፈቃድ: ${summary.permissions}\n❌ ቀሩ: ${summary.absents}`
      );
    } else {
      await sendMessage(token, chatId, "✅ ክሮን ሪፖርቱ ተልኳል።");
    }
  } catch (err) {
    await sendMessage(
      token,
      chatId,
      `❌ ክሮን ሪፖርቱን ማስጀመር አልተቻለም: ${err.message}`
    );
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Admin Bot Webhook active!");
  }

  try {
    const { message } = req.body;
    const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;

    if (!ADMIN_BOT_TOKEN) {
      console.error("ADMIN_BOT_TOKEN is not set");
      return res.status(200).json({ ok: true });
    }

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;
    const firstName = message.from?.first_name || "Admin";
    const text = message.text.trim();

    // Auth check
    if (!isAdmin(userId)) {
      await sendMessage(
        ADMIN_BOT_TOKEN,
        chatId,
        "⛔ ይቅርታ! ይህን ቦት ለመጠቀም ፈቃድ የለዎትም።"
      );
      return res.status(200).json({ ok: true });
    }

    // Route commands
    if (text.startsWith("/start")) {
      const welcome =
        `👋 ሰላም *${firstName}*!\n\n` +
        `🛠 ወደ *የበገና ትምህርት አስተዳዳሪ ቦት* እንኳን ደህና መጡ!\n\n` +
        `📝 አቴንዳንስ ለመመዝገብ /submit\n` +
        `ሁሉም ትዕዛዞችን ለማየት /help ይጫኑ።`;
      await sendMessage(ADMIN_BOT_TOKEN, chatId, welcome);
    } else if (text.startsWith("/submit")) {
      // Open mini app in admin mode (no lock, no time/GPS restriction)
      const appBaseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://telegram-attendance-dzbz.vercel.app";
      await axios.post(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "📝 *አቴንዳንስ ለመመዝገብ ከታች ይጫኑ:*\n_(የጊዜ እና GPS ገደብ የለም)_",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "📝 አቴንዳንስ መዝግብ (Admin)",
              web_app: { url: `${appBaseUrl}/#admin` },
            },
          ]],
        },
      });
    } else if (text.startsWith("/help")) {
      await handleHelp(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/today")) {
      await handleToday(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/present")) {
      await handlePresent(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/permission")) {
      await handlePermission(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/absent")) {
      await handleAbsent(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/group")) {
      const parts = text.split(/\s+/);
      await handleGroup(ADMIN_BOT_TOKEN, chatId, parts[1] || "");
    } else if (text.startsWith("/stats")) {
      await handleStats(ADMIN_BOT_TOKEN, chatId);
    } else if (text.startsWith("/search")) {
      const query = text.replace(/^\/search\s*/i, "").trim();
      await handleSearch(ADMIN_BOT_TOKEN, chatId, query);
    } else if (text.startsWith("/announce")) {
      const msg = text.replace(/^\/announce\s*/i, "").trim();
      await handleAnnounce(ADMIN_BOT_TOKEN, chatId, msg);
    } else if (text.startsWith("/bypass")) {
      const host = req.headers.host;
      await handleBypass(ADMIN_BOT_TOKEN, chatId, host);
    } else {
      await sendMessage(
        ADMIN_BOT_TOKEN,
        chatId,
        "❓ ትዕዛዙ አልታወቀም። ሁሉም ትዕዛዞችን ለማየት /help ይጫኑ።"
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Admin Webhook Error:", error.message);
    return res.status(200).json({ ok: true });
  }
}
