// api/submit.js
import axios from "axios";
import { google } from "googleapis";
import { attendanceStore } from "../lib/store.js";
// In-memory record tracking
const dailySubmissions = new Map();

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
  // Leap-year New Year falls on Sep 12 instead of Sep 11.
  const isGregorianLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const ethNewYearDay = isGregorianLeap ? 12 : 11; // Sep 11 normally, Sep 12 in Gregorian leap years
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

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function appendToSheet({ fullName, group, status, reason, date, time }) {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson || !sheetId) {
    console.warn("[Sheets] Skipping — GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID not set");
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
    // Normalize escaped newlines in the private key.
    // When stored as a single-line env var, \n sequences become literal \\n;
    // the Google Auth library requires real newline characters in the PEM key.
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
  } catch (e) {
    console.error("[Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e.message);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const statusText = status === "present"
    ? "ተገኝቷል / ተገኝታለች"
    : "ፈቃድ ጠይቋል / ጠይቃለች";

  try {
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[date, time, fullName, group, statusText, reason || ""]],
      },
    });
    console.log("[Sheets] Row appended successfully:", result.data.updates?.updatedRange);
  } catch (e) {
    console.error("[Sheets] Failed to append row:", e.message, e.response?.data || "");
    // Don't rethrow — sheet failure should not block the main response
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

const now = new Date();
  const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  const dayOfWeek = eatDate.getUTCDay(); // 1 = Mon, 3 = Wed, 5 = Fri
  const totalMinutes = eatDate.getUTCHours() * 60 + eatDate.getUTCMinutes();

  const isClassDay = [1, 3, 5].includes(dayOfWeek);

  // Peek at status so we can apply different time rules before full body parse
  const requestStatus = req.body?.status;

  if (process.env.ALLOW_OFFTIME_SUBMISSION !== "true") {
    if (requestStatus === "permission") {
      // Permission windows (class days only):
      //   Morning window → before 1 Ethiopian clock  = before 07:00 EAT (totalMinutes < 420)
      //   Lunch   window → before 7 Ethiopian clock  = before 13:00 EAT (totalMinutes < 780)
      // GPS is NOT required for permission — only the time window matters.
      const isPermissionWindow = totalMinutes < 780; // covers both morning & lunch
      if (!isClassDay || !isPermissionWindow) {
        return res.status(400).json({
          message:
            "ፈቃድ ማስገባት የሚቻለው ሰኞ፣ ረቡዕ እና ዓርብ ጧት እስከ 1 ሰዓት (7 AM) ወይም ቀኑ እስከ 7 ሰዓት (1 PM) ብቻ ነው።",
        });
      }
    } else {
      // Present: must be within the class evening window
      // Extended Window: 5:30 PM (1050 min) to 12:30 AM (30 min next day) EAT
      // totalMinutes wraps 0–1439; past midnight is 0–29
      const isWithinWindow = totalMinutes >= 1050 || totalMinutes <= 30;
      if (!isClassDay || !isWithinWindow) {
        return res.status(400).json({
          message: "የአቴንዳንስ መመዝገቢያ ክፍት የሚሆነው ሰኞ፣ ረቡዕ እና ዓርብ ከማታ 11:30 እስከ 2:30 ብቻ ነው።",
        });
      }
    }
  }

  try {
    const { fullName, group, status, reason, latitude, longitude } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "ሙሉ ስም ማስገባት አስፈላጊ ነው።" });
    }

    const normalizedName = fullName.trim().toLowerCase();
    const todayKey = now.toISOString().split("T")[0];
    const userKey = `${todayKey}_${normalizedName}`;

    if (process.env.DISABLE_SINGLE_SUBMISSION_CHECK !== "true" && dailySubmissions.has(userKey)) {
      return res.status(400).json({
        message: "ለዛሬ መዝግበዋል። በአንድ ቀን ከአንድ ጊዜ በላይ መመዝገብ አይቻልም።",
      });
    }

    if (status === "permission" && (!reason || !reason.trim())) {
      return res.status(400).json({ message: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።" });
    }

    if (status === "present" && process.env.DISABLE_GPS_CHECK !== "true") {
      if (!latitude || !longitude) {
        return res.status(400).json({
          message: "ቦታዎን ማረጋገጥ አልተቻለም። እባክዎ የስልክዎን ቦታ (Location / GPS) ያብሩ።",
        });
      }

      const CLASS_LAT = parseFloat(process.env.CLASS_LAT || "9.010211");
      const CLASS_LNG = parseFloat(process.env.CLASS_LNG || "38.761234");
      const MAX_DISTANCE = parseFloat(process.env.MAX_DISTANCE_METERS || "100");

      const distance = getDistanceInMeters(CLASS_LAT, CLASS_LNG, parseFloat(latitude), parseFloat(longitude));

      if (distance > MAX_DISTANCE) {
        return res.status(400).json({
          message: `ከትምህርት ቦታ ውጪ መመዝገብ አይቻልም። አሁን ከትምህርት ቦታ ${Math.round(distance)} ሜትር ርቀው ይገኛሉ።`,
        });
      }
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "የሰርቨር ውቅር ስህተት አጋጥሟል።" });
    }

    const ethioFormattedDate = getEthiopianDate(now);

    // Ethiopian time = EAT (UTC+3) minus 6 hours, with 12-hour cycle starting at dawn
    const eatHour = eatDate.getUTCHours();
    const eatMinute = eatDate.getUTCMinutes();
    const ethHour = ((eatHour - 6 + 24) % 12) || 12;
    const ethPeriod = (eatHour >= 6 && eatHour < 18) ? "ቀን" : "ማታ";
    const formattedTime = `${ethHour}:${String(eatMinute).padStart(2, "0")} ${ethPeriod}`;

    const isPresent = status === "present";
    const statusText = isPresent ? "ተገኝቷል / ተገኝታለች" : "ፈቃድ ጠይቋል / ጠይቃለች";
    const groupText = group && group.trim() ? group.trim() : "ያልተጠቀሰ";

    let attendanceMessage = 
      `🎼 *የበገና ትምህርት ክፍል መገኘት መዝገብ*\n\n` +
      `👤 *ሙሉ ስም:*\u2001\u2001${fullName.trim()}\n` +
      `📍 *ቡድን:*\u2001\u2001\u2001${groupText}\n` +
      `📊 *ሁኔታ:*\u2001\u2001\u2001${statusText}\n` +
      `📅 *ቀን:*\u2001\u2001\u2001\u2001${ethioFormattedDate}\n` +
      `⏰ *ሰዓት:*\u2001\u2001\u2001${formattedTime}`;

    if (!isPresent && reason && reason.trim()) {
      attendanceMessage += `\n📝 *ምክንያት:*\u2001\u2001${reason.trim()}`;
    }

    const rawTopicId = isPresent
      ? process.env.TELEGRAM_TOPIC_PRESENT
      : process.env.TELEGRAM_TOPIC_PERMISSION;

    const payload = {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    };

    if (rawTopicId) {
      const topicId = parseInt(rawTopicId, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

    attendanceStore.addStudent(fullName);
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);

    // Append row to Google Sheet
    await appendToSheet({
      fullName: fullName.trim(),
      group: groupText,
      status,
      reason: status === "permission" ? reason : "",
      date: ethioFormattedDate,
      time: formattedTime,
    });

    dailySubmissions.set(userKey, true);

    return res.status(200).json({ success: true, message: "መረጃዎ በተሳካ ሁኔታ ተመዝግቧል!" });
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("Telegram API Error:", errorDetails);
    return res.status(500).json({
      message: "መዝገቡን ማስገባት አልተቻለም።",
      error: typeof errorDetails === "object" ? JSON.stringify(errorDetails) : errorDetails,
    });
  }
}