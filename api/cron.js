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

export default async function handler(req, res) {
  // Verify Vercel Cron Signature to secure the endpoint (allow bypass parameter for testing)
  const authHeader = req.headers.authorization;
  const isBypassed = req.query.bypass === "true";
  if (
    process.env.NODE_ENV === "production" &&
    !isBypassed &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
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

  try {
    // Get current Ethiopian date (matching UTC+3 eatDate)
    const now = new Date();
    const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const ethioFormattedDate = getEthiopianDate(now);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A:E",
    });

    const rows = response.data.values || [];
    // Filter rows matching today's Ethiopian date (column index 3)
    const todaySubmissions = rows.filter((row) => row[3] === ethioFormattedDate);

    // Create lookup sets of submitted names (normalized)
    const presentNames = new Set();
    const permissionNames = new Set();

    todaySubmissions.forEach((row) => {
      const name = (row[0] || "").trim().toLowerCase();
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

    STUDENTS.forEach((student) => {
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

    // 1. Send / Update Present List -> Topic 88 (or TELEGRAM_TOPIC_PRESENT_TEST)
    const presentTopic = parseInt(process.env.TELEGRAM_TOPIC_PRESENT_TEST || "88", 10);
    let presentMessage = `📅 *የዛሬ ሙሉ የተገኙ ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    presentMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (presentsList.length === 0) {
      presentMessage += `⚠️ ዛሬ የተገኘ ተማሪ የለም።\n`;
    } else {
      presentsList.forEach((s, idx) => {
        presentMessage += `${idx + 1}. *${s.name}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: presentMessage,
      parse_mode: "Markdown",
      message_thread_id: presentTopic,
    });

    // 2. Send Permission List -> Topic 94
    const permissionTopic = 94;
    let permissionMessage = `📅 *የዛሬ ፈቃድ የጠየቁ ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    permissionMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (permissionsList.length === 0) {
      permissionMessage += `✅ ዛሬ ፈቃድ የጠየቀ ተማሪ የለም።\n`;
    } else {
      permissionsList.forEach((s, idx) => {
        permissionMessage += `${idx + 1}. *${s.name}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: permissionMessage,
      parse_mode: "Markdown",
      message_thread_id: permissionTopic,
    });

    // 3. Send Absent List -> Topic 96
    const absentTopic = 96;
    let absentMessage = `📅 *የዛሬ የቀሩ (ያልተመዘገቡ) ተማሪዎች መዝገብ — ${ethioFormattedDate}*\n`;
    absentMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (absentsList.length === 0) {
      absentMessage += `🎉 ዛሬ የቀረ ተማሪ የለም! ሁሉም ተመዝግበዋል።\n`;
    } else {
      absentsList.forEach((s, idx) => {
        absentMessage += `${idx + 1}. *${s.name}* (ቡድን: ${s.group.split(":")[0]})\n`;
      });
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: absentMessage,
      parse_mode: "Markdown",
      message_thread_id: absentTopic,
    });

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
