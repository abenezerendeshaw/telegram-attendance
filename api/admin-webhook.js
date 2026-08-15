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

// Reads today's rows from the daily tab if it exists, falls back to Sheet1 filter
async function getTodayRowsFromSheet() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const ethioToday = getEthiopianToday();

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title))",
    });
    const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);

    if (existingTabs.includes(ethioToday)) {
      // Daily tab exists — read all rows, skip the header row
      const dailyResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${ethioToday}'!A:E`,
      });
      const dailyRows = dailyResponse.data.values || [];
      return dailyRows.length > 1 ? dailyRows.slice(1) : [];
    }
  } catch (_) {
    // fall through to Sheet1 filter
  }

  // Fallback: filter master Sheet1 by date column
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A:E",
  });
  const rows = response.data.values || [];
  return rows.filter((row) => row[3] === ethioToday);
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
  const todayRows = await getTodayRowsFromSheet();
  const ethioToday = getEthiopianToday();

  const presentNames = new Set();
  const permissionNames = new Set();

  for (const row of todayRows) {
    const name = (row[0] || "").trim().toLowerCase();
    const status = (row[2] || "").trim();
    if (status.includes("ተገኝቷል")) {
      presentNames.add(name);
    } else {
      permissionNames.add(name);
    }
  }

  const presentList = STUDENTS.filter((s) =>
    presentNames.has(s.name.trim().toLowerCase())
  );
  const permissionList = STUDENTS.filter((s) =>
    permissionNames.has(s.name.trim().toLowerCase())
  );
  const absentList = STUDENTS.filter(
    (s) =>
      !presentNames.has(s.name.trim().toLowerCase()) &&
      !permissionNames.has(s.name.trim().toLowerCase())
  );

  const total = STUDENTS.length;

  let msg =
    `📊 *የዛሬ ማጠቃለያ — ${ethioToday}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ ተገኙ: *${presentList.length}/${total}*\n` +
    `📝 ፈቃድ: *${permissionList.length}/${total}*\n` +
    `❌ ቀሩ:  *${absentList.length}/${total}*\n\n`;

  // Per-group breakdown
  for (const group of GROUPS) {
    const gStudents = STUDENTS.filter((s) => s.group === group);
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
  const todayRows = await getTodayRowsFromSheet();
  const ethioToday = getEthiopianToday();

  const presentNames = new Set(
    todayRows
      .filter((r) => (r[2] || "").includes("ተገኝቷል"))
      .map((r) => (r[0] || "").trim().toLowerCase())
  );

  const presentList = STUDENTS.filter((s) =>
    presentNames.has(s.name.trim().toLowerCase())
  );

  let msg = `✅ *ዛሬ የተገኙ ተማሪዎች — ${ethioToday}* (${presentList.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (presentList.length === 0) {
    msg += "⚠️ ዛሬ ማንም አልተገኘም።\n";
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
  const todayRows = await getTodayRowsFromSheet();
  const ethioToday = getEthiopianToday();

  const permRows = todayRows.filter(
    (r) => !(r[2] || "").includes("ተገኝቷል")
  );
  const permNames = new Set(
    permRows.map((r) => (r[0] || "").trim().toLowerCase())
  );

  // Get reasons from sheet rows
  const reasonMap = {};
  for (const row of permRows) {
    const key = (row[0] || "").trim().toLowerCase();
    // Column E (index 4) is time — reason is stored in the Telegram message not the sheet
    // We can show the time at least
    reasonMap[key] = row[4] || "";
  }

  const permList = STUDENTS.filter((s) =>
    permNames.has(s.name.trim().toLowerCase())
  );

  let msg = `📝 *ዛሬ ፈቃድ የጠየቁ ተማሪዎች — ${ethioToday}* (${permList.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (permList.length === 0) {
    msg += "✅ ዛሬ ፈቃድ የጠየቀ ተማሪ የለም።\n";
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
  const todayRows = await getTodayRowsFromSheet();
  const ethioToday = getEthiopianToday();

  const submittedNames = new Set(
    todayRows.map((r) => (r[0] || "").trim().toLowerCase())
  );

  const absentList = STUDENTS.filter(
    (s) => !submittedNames.has(s.name.trim().toLowerCase())
  );

  let msg = `❌ *ዛሬ ያልተመዘገቡ ተማሪዎች — ${ethioToday}* (${absentList.length}/${STUDENTS.length})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (absentList.length === 0) {
    msg += "🎉 ሁሉም ተማሪዎች ዛሬ ተመዝግበዋል!\n";
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
  const num = parseInt(groupNum, 10);
  if (isNaN(num) || num < 1 || num > 4) {
    await sendMessage(token, chatId, "❌ ትክክለኛ ቡድን ቁጥር ያስገቡ (1-4)። ምሳሌ: /group 2");
    return;
  }

  const group = GROUPS[num - 1];
  const groupStudents = STUDENTS.filter((s) => s.group === group);

  const todayRows = await getTodayRowsFromSheet();
  const ethioToday = getEthiopianToday();

  const presentNames = new Set(
    todayRows
      .filter((r) => (r[2] || "").includes("ተገኝቷል"))
      .map((r) => (r[0] || "").trim().toLowerCase())
  );
  const permissionNames = new Set(
    todayRows
      .filter((r) => !(r[2] || "").includes("ተገኝቷል"))
      .map((r) => (r[0] || "").trim().toLowerCase())
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
    `📌 *${group} — ${ethioToday}*\n` +
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
  if (rows.length === 0) {
    await sendMessage(token, chatId, "📊 ምንም መዝገብ አልተገኘም።");
    return;
  }

  const totalRows = rows.length;
  const presentRows = rows.filter((r) => (r[2] || "").includes("ተገኝቷል")).length;
  const permissionRows = totalRows - presentRows;

  // Unique dates
  const dates = new Set(rows.map((r) => r[3]).filter(Boolean));
  const classDays = dates.size;

  // Per-group submission count
  const groupCounts = {};
  for (const group of GROUPS) {
    const shortGroup = group.split(":")[0];
    groupCounts[shortGroup] = { present: 0, permission: 0 };
  }

  for (const row of rows) {
    const nameKey = (row[0] || "").trim().toLowerCase();
    const student = STUDENTS.find(
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
  const normalizedQuery = query.trim().toLowerCase();

  // Match by Amharic or English name
  const student = STUDENTS.find(
    (s) =>
      s.name.trim().toLowerCase().includes(normalizedQuery) ||
      (s.englishName &&
        s.englishName.trim().toLowerCase().includes(normalizedQuery))
  );

  const studentName = student ? student.name.trim().toLowerCase() : normalizedQuery;

  const matches = rows.filter((r) =>
    (r[0] || "").trim().toLowerCase().includes(studentName)
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
      await axios.post(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "📝 *አቴንዳንስ ለመመዝገብ ከታች ይጫኑ:*\n_(የጊዜ እና GPS ገደብ የለም)_",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "📝 አቴንዳንስ መዝግብ (Admin)",
              web_app: { url: "https://telegram-attendance-dzbz.vercel.app/#admin" },
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
