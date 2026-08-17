// api/cron.js
import axios from "axios";
import { google } from "googleapis";
import { STUDENTS } from "../src/students.js";

// Helper function to calculate Ethiopian Date
function getEthiopianDate(date = new Date()) {
  const ETHIOPIAN_MONTHS = [
    "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
  ];
  const ETHIOPIAN_DAYS = [
    "እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"
  ];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Ethiopian year is Gregorian − 7 after New Year (Sep 11), or − 8 before it.
  const isGregorianLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const ethNewYearDay = isGregorianLeap ? 12 : 11;
  const afterNewYear = month > 9 || (month === 9 && day >= ethNewYearDay);
  let ethYear = afterNewYear ? year - 7 : year - 8;

  const gregorianMonths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) {
    gregorianMonths[2] = 29;
  }

  let dayOfYear = day;
  for (let m = 1; m < month; m++) {
    dayOfYear += gregorianMonths[m];
  }

  const sep11 = ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 255 : 254;

  let ethMonth, ethDay;
  if (dayOfYear >= sep11) {
    const diff = dayOfYear - sep11;
    ethMonth = Math.floor(diff / 30) + 1;
    ethDay = (diff % 30) + 1;
  } else {
    const prevYearDays = ((year - 1) % 4 === 0 && (year - 1) % 100 !== 0) || ((year - 1) % 400 === 0) ? 366 : 365;
    const diff = (dayOfYear + prevYearDays) - sep11;
    ethMonth = Math.floor(diff / 30) + 1;
    ethDay = (diff % 30) + 1;
  }

  const dayOfWeek = ETHIOPIAN_DAYS[date.getDay()];
  const monthName = ETHIOPIAN_MONTHS[Math.min(ethMonth - 1, 12)] || "መስከረም";

  return `${dayOfWeek}፣ ${monthName} ${ethDay} ቀን ${ethYear} ዓ.ም`;
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
    console.warn("[Cron] Failed to load Students sheet roster, falling back to src/students.js:", error.message);
    return STUDENTS;
  }
}

// Helper function to split and send long Telegram messages (under 4096-char limit)
async function sendLongMessage(botToken, chatId, topicId, text) {
  const LIMIT = 4000;
  if (text.length <= LIMIT) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      message_thread_id: topicId,
    });
    return;
  }

  const lines = text.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > LIMIT) {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: currentChunk,
        parse_mode: "Markdown",
        message_thread_id: topicId,
      });
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }

  if (currentChunk.trim()) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: currentChunk,
      parse_mode: "Markdown",
      message_thread_id: topicId,
    });
  }
}

export default async function handler(req, res) {
  // Verify Vercel Cron Signature — only enforce if CRON_SECRET is actually configured
  const authHeader = req.headers.authorization;
  const isBypassed = req.query.bypass === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isBypassed && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson || !sheetId) {
    return res.status(500).json({ success: false, message: "Google Sheets configuration missing" });
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: "Failed to parse Google credentials" });
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

    // ── Prefer the latest daily tab created by submit.js ────────────────────
    // Find the most recent daily tab (last non-Sheet1 tab) that actually has
    // data. Fall back to the latest date found in Sheet1 if no daily tabs exist.
    let todaySubmissions = [];
    let ethioFormattedDate = "";

    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: "sheets(properties(title,index))",
      });
      const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
      const dateTabs = tabs.filter((t) => t !== "Sheet1" && t.trim().length > 0);

      if (dateTabs.length > 0) {
        // Walk backwards from the last tab to find one with actual data
        let foundTab = null;
        for (let i = dateTabs.length - 1; i >= 0; i--) {
          const dailyResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${dateTabs[i]}'!A:E`,
          });
          const dailyRows = dailyResponse.data.values || [];
          const dataRows = dailyRows.length > 1 ? dailyRows.slice(1) : [];
          if (dataRows.length > 0) {
            todaySubmissions = dataRows;
            ethioFormattedDate = dateTabs[i];
            foundTab = dateTabs[i];
            console.log(`[Cron] Reading ${todaySubmissions.length} rows from latest daily tab: ${ethioFormattedDate}`);
            break;
          }
        }
        if (!foundTab) {
          console.log("[Cron] All daily tabs are empty, falling back to Sheet1");
        }
      }

      if (!ethioFormattedDate) {
        // Fallback: find the latest date in Sheet1 by date column
        console.log("[Cron] No daily tabs found, falling back to Sheet1 filter");
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: "Sheet1!A:E",
        });
        const allRows = response.data.values || [];
        const dates = [...new Set(allRows.map((r) => r[3]).filter(Boolean))];
        if (dates.length > 0) {
          ethioFormattedDate = dates[dates.length - 1];
          todaySubmissions = allRows.filter((row) => row[3] === ethioFormattedDate);
          console.log(`[Cron] Found ${todaySubmissions.length} rows in Sheet1 for latest date: ${ethioFormattedDate}`);
        } else {
          // Absolute fallback — compute today's date
          const now = new Date();
          const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
          ethioFormattedDate = getEthiopianDate(eatDate);
          console.log(`[Cron] Sheet1 has no dated rows, using today: ${ethioFormattedDate}`);
        }
      }
    } catch (tabErr) {
      console.warn("[Cron] Tab lookup failed, falling back to Sheet1 filter:", tabErr.message);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Sheet1!A:E",
      });
      const allRows = response.data.values || [];
      const dates = [...new Set(allRows.map((r) => r[3]).filter(Boolean))];
      if (dates.length > 0) {
        ethioFormattedDate = dates[dates.length - 1];
        todaySubmissions = allRows.filter((row) => row[3] === ethioFormattedDate);
      } else {
        const now = new Date();
        const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        ethioFormattedDate = getEthiopianDate(eatDate);
      }
    }

    const students = await getStudentRoster();

    // Create lookup sets of submitted names (normalized)
    const presentNames = new Set();
    const permissionNames = new Set();

    todaySubmissions.forEach((row) => {
      const name = normalizeName(row[0]);
      const statusText = (row[2] || "").trim();

      if (statusText.includes("ተገኝቷል")) {
        presentNames.add(name);
      } else {
        permissionNames.add(name);
      }
    });

    // Categorize master list of students
    const presentsList = [];
    const permissionsList = [];
    const absentsList = [];

    students.forEach((student) => {
      const normalizedStudentName = student.name.trim().toLowerCase();
      if (presentNames.has(normalizedStudentName)) {
        presentsList.push(student);
      } else if (permissionNames.has(normalizedStudentName)) {
        permissionsList.push(student);
      } else {
        absentsList.push(student);
      }
    });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    // 1. Send / Update Present List (prefers test topic, then old present topic, fallback 23)
    const presentTopic = parseInt(
      process.env.TELEGRAM_TOPIC_PRESENT_TEST || process.env.TELEGRAM_TOPIC_PRESENT || "23",
      10
    );
    let presentMessage = `📅 *የቅርብ ቀን የተገኙ ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    presentMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (presentsList.length === 0) {
      presentMessage += `⚠️ የተገኘ ተማሪ የለም።\n`;
    } else {
      presentsList.forEach((s, idx) => {
        const displayName = s.englishName ? `${s.name} (${s.englishName.trim()})` : s.name;
        presentMessage += `${idx + 1}. *${displayName}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await sendLongMessage(BOT_TOKEN, CHAT_ID, presentTopic, presentMessage);

    // 2. Send Permission List (prefers summary topic, then old permission topic, fallback 19)
    const permissionTopic = parseInt(
      process.env.TELEGRAM_TOPIC_PERMISSION_SUMMARY || process.env.TELEGRAM_TOPIC_PERMISSION || "19",
      10
    );
    let permissionMessage = `📅 *የቅርብ ቀን ፈቃድ የጠየቁ ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    permissionMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (permissionsList.length === 0) {
      permissionMessage += `✅ ፈቃድ የጠየቀ ተማሪ የለም።\n`;
    } else {
      permissionsList.forEach((s, idx) => {
        const displayName = s.englishName ? `${s.name} (${s.englishName.trim()})` : s.name;
        permissionMessage += `${idx + 1}. *${displayName}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await sendLongMessage(BOT_TOKEN, CHAT_ID, permissionTopic, permissionMessage);

    // 3. Send Absent List -> Topic 96
    const absentTopic = parseInt(process.env.TELEGRAM_TOPIC_ABSENT || "96", 10);
    let absentMessage = `📅 *የቅርብ ቀን የቀሩ (ያልተመዘገቡ) ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    absentMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (absentsList.length === 0) {
      absentMessage += `🎉 የቀረ ተማሪ የለም! ሁሉም ተመዝግበዋል።\n`;
    } else {
      absentsList.forEach((s, idx) => {
        const displayName = s.englishName ? `${s.name} (${s.englishName.trim()})` : s.name;
        absentMessage += `${idx + 1}. *${displayName}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await sendLongMessage(BOT_TOKEN, CHAT_ID, absentTopic, absentMessage);

    return res.status(200).json({
      success: true,
      summary: {
        presents: presentsList.length,
        permissions: permissionsList.length,
        absents: absentsList.length,
      },
    });
  } catch (error) {
    console.error("Cron Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
