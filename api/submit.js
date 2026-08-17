// api/submit.js
import axios from "axios";
import { google } from "googleapis";
import { attendanceStore } from "../lib/store.js";
import { STUDENTS } from "../src/students.js";
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

// Column order: ሙሉ ስም | ቡድን | ሁኔታ | ቀን | ሰዓት
async function appendToSheet({ fullName, group, status, date, time }) {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson || !sheetId) {
    console.warn("[Sheets] Skipping — GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID not set");
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
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

  // Ensure a dedicated `Students` tab exists and is populated with the canonical
  // roster from `src/students.js`. We overwrite the tab contents so the sheet
  // always matches the code roster used for comparisons.
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title))",
    });
    const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);

    if (!existingTabs.includes("Students")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: "Students" } } }] },
      });
      console.log("[Sheets] Created Students tab");
    }

    const rows = STUDENTS.map((s) => [s.name || "", s.englishName || "", s.group || ""]);
    const payload = { values: [["name", "englishName", "group"], ...rows] };
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Students!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: payload,
    });
    console.log("[Sheets] Students tab populated from src/students.js");
  } catch (e) {
    console.error("[Sheets] Failed to ensure Students tab:", e.message, e.response?.data || "");
  }

  const statusText = status === "present"
    ? "ተገኝቷል / ተገኝታለች"
    : "ፈቃድ ጠይቋል / ጠይቃለች";

  // ── Always append to master Sheet1 ──────────────────────────────────────
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[fullName, group, statusText, date, time]] },
    });
    console.log("[Sheets] Row appended to Sheet1");
  } catch (e) {
    console.error("[Sheets] Failed to append to Sheet1:", e.message, e.response?.data || "");
  }

  // ── Also append to the daily tab (named by the Ethiopian date) ───────────
  // Tab name: use the date string but shorten it to fit Sheet tab limits (100 chars max)
  // e.g. "ሰኞ፣ መስከረም 5 ቀን 2017 ዓ.ም" → used as-is (well within 100 chars)
  const dailyTabName = date; // Ethiopian date string is the tab name

  try {
    // Check if the daily tab already exists
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title))",
    });
    const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);

    if (!existingTabs.includes(dailyTabName)) {
      // Create the tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: dailyTabName } } }],
        },
      });
      // Add header row
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `'${dailyTabName}'!A:E`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["ሙሉ ስም", "ቡድን", "ሁኔታ", "ቀን", "ሰዓት"]],
        },
      });
      console.log(`[Sheets] Created daily tab: ${dailyTabName}`);
    }

    // Append to daily tab
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${dailyTabName}'!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[fullName, group, statusText, date, time]] },
    });
    console.log(`[Sheets] Row appended to daily tab: ${dailyTabName}`);
    // ── Update `Students` tab by adding a date column (if needed)
    // and marking the student's row with a check/cross. This keeps Sheet1
    // as the append-only log and uses Students for roster-style marks.
    try {
      const headerResp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Students!1:1",
      });
      const headers = (headerResp.data.values && headerResp.data.values[0]) || [];

      // Date columns start after name, englishName, group (A-C => indexes 0-2)
      const existingIndex = headers.findIndex((h) => (h || "").toString().trim() === dailyTabName);
      const newColIndexZeroBased = existingIndex !== -1 ? existingIndex : Math.max(headers.length, 3);

      function colNumberToLetter(n) {
        let s = "";
        while (n > 0) {
          const m = (n - 1) % 26;
          s = String.fromCharCode(65 + m) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      }

      const targetColNumber = newColIndexZeroBased + 1; // 1-based
      const targetColLetter = colNumberToLetter(targetColNumber);

      if (existingIndex === -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Students!${targetColLetter}1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[dailyTabName]] },
        });
      }

      // Find student's row in Students column A
      const colAResp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Students!A:A",
      });
      const colA = colAResp.data.values || [];
      const searchName = (fullName || "").toString().replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
      let foundRow = -1;
      for (let i = 0; i < colA.length; i++) {
        const cell = (colA[i] && colA[i][0]) ? colA[i][0].toString().replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase() : "";
        if (cell === searchName) {
          foundRow = i + 1; // 1-based
          break;
        }
      }

      if (foundRow !== -1) {
        const mark = status === "present" ? "✔" : "✖";
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `Students!${targetColLetter}${foundRow}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[mark]] },
        });
        console.log(`[Sheets] Marked ${fullName} as ${mark} in Students column ${dailyTabName}`);
      } else {
        console.log(`[Sheets] Student ${fullName} not found in Students tab; skipping mark.`);
      }
    } catch (e) {
      console.error("[Sheets] Failed to update Students date column:", e.message, e.response?.data || "");
    }
  } catch (e) {
    console.error("[Sheets] Failed to append to daily tab:", e.message, e.response?.data || "");
    // Don't rethrow — daily tab failure should not block the main response
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

  // Peek at both status and adminOverride early
  const requestStatus = req.body?.status;
  const isAdminOverride = req.body?.adminOverride === true;

  // Skip ALL time/day/GPS/duplicate checks when admin override is set
  if (!isAdminOverride && process.env.ALLOW_OFFTIME_SUBMISSION !== "true") {
    if (requestStatus === "permission") {
      const isPermissionWindow = totalMinutes < 780;
      if (!isClassDay || !isPermissionWindow) {
        return res.status(400).json({
          message:
            "ፈቃድ ማስገባት የሚቻለው ሰኞ፣ ረቡዕ እና ዓርብ ጧት እስከ 1 ሰዓት (7 AM) ወይም ቀኑ እስከ 7 ሰዓት (1 PM) ብቻ ነው።",
        });
      }
    } else {
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
      if (!isAdminOverride) {
        return res.status(400).json({
          message: "ለዛሬ መዝግበዋል። በአንድ ቀን ከአንድ ጊዜ በላይ መመዝገብ አይቻልም።",
        });
      }
    }

    if (status === "permission" && (!reason || !reason.trim())) {
      return res.status(400).json({ message: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።" });
    }

    if (status === "present" && !isAdminOverride && process.env.DISABLE_GPS_CHECK !== "true") {
      if (!latitude || !longitude) {
        return res.status(400).json({
          message: "ቦታዎን ማረጋገጥ አልተቻለም። እባክዎ የስልክዎን ቦታ (Location / GPS) ያብሩ።",
        });
      }

      const CLASS_LAT = parseFloat(process.env.CLASS_LAT || "9.010211");
      const CLASS_LNG = parseFloat(process.env.CLASS_LNG || "38.761234");
      const MAX_DISTANCE = parseFloat(process.env.MAX_DISTANCE_METERS || "400");

      const distance = getDistanceInMeters(CLASS_LAT, CLASS_LNG, parseFloat(latitude), parseFloat(longitude));

      if (distance > MAX_DISTANCE) {
        return res.status(400).json({
          message: `ከትምህርት ቦታ ውጪ መመዝገብ አይቻልም። አሁን ከትምህርት ቦታ ${Math.round(distance)} ሜትር ርቀው ይገኛሉ።`,
        });
      }
    }

    // Lookup student to get English name for dual mode display
    const studentRecord = STUDENTS.find(
      (s) => s.name.trim().toLowerCase() === normalizedName
    );
    const displayName =
      studentRecord && studentRecord.englishName
        ? `${fullName.trim()} (${studentRecord.englishName.trim()})`
        : fullName.trim();

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
      `👤 *ሙሉ ስም:*\u2001\u2001${displayName}\n` +
      `📍 *ቡድን:*\u2001\u2001\u2001${groupText}\n` +
      `📊 *ሁኔታ:*\u2001\u2001\u2001${statusText}\n` +
      `📅 *ቀን:*\u2001\u2001\u2001\u2001${ethioFormattedDate}\n` +
      `⏰ *ሰዓት:*\u2001\u2001\u2001${formattedTime}`;

    if (!isPresent && reason && reason.trim()) {
      attendanceMessage += `\n📝 *ምክንያት:*\u2001\u2001${reason.trim()}`;
    }

    // Individual check-ins (present & permission) → General tab (no topic thread)
    const payload = {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    };

    attendanceStore.addStudent(fullName);

    // Send to General tab
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);

    // Append row to Google Sheet — columns: ሙሉ ስም | ቡድን | ሁኔታ | ቀን | ሰዓት
    await appendToSheet({
      fullName: displayName,
      group: groupText,
      status,
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