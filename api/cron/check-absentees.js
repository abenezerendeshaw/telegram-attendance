// api/cron/check-absentees.js
import axios from "axios";

// Pure JavaScript Ethiopian Date Converter
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

  let ethYear = year - 8;
  if (month < 9 || (month === 9 && day < 11)) ethYear -= 1;

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

// Safely load master roster
async function loadMasterStudents() {
  try {
    const rosterModule = await import("../../src/students.js");
    return rosterModule.STUDENTS || rosterModule.default || [];
  } catch (err) {
    console.error("Failed to load students roster file:", err);
    return [];
  }
}

export default async function handler(req, res) {
  // Authorization check (ignored in dev mode or if CRON_SECRET is not configured)
  const authHeader = req.headers.authorization;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ message: "Unauthorized request." });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TOPIC_ABSENT = process.env.TELEGRAM_TOPIC_ABSENT;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "Missing Telegram configuration variables." });
    }

    const masterStudents = await loadMasterStudents();
    if (!masterStudents || masterStudents.length === 0) {
      return res.status(500).json({ message: "Master student list is empty or missing." });
    }

    // Fetch today's submitted names from database/storage
    const todaySubmissions = await getTodaySubmittedStudentNames(); 
    const submittedNameSet = new Set(
      todaySubmissions.map((name) => name.trim().toLowerCase())
    );

    // Identify absentees
    const absentStudents = masterStudents.filter((student) => {
      const name = typeof student === "string" ? student : student.name;
      return name && !submittedNameSet.has(name.trim().toLowerCase());
    });

    if (absentStudents.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ሁሉም ተማሪዎች ተመዝግበዋል። ምንም የቀረ የለም!",
      });
    }

    // Group absentees by group name
    const groupedAbsentees = absentStudents.reduce((acc, student) => {
      const name = typeof student === "string" ? student : student.name;
      const group = typeof student === "string" ? "ያልተመደበ" : (student.group || "ያልተመደበ");
      
      if (!acc[group]) acc[group] = [];
      acc[group].push(name);
      return acc;
    }, {});

    // Build Telegram markdown message
    const ethioDate = getEthiopianDate();
    let message = `🚨 *የዕለቱ የቀሩ ተማሪዎች መዝገብ*\n\n📅 *ቀን:*\u2001\u2001${ethioDate}\n\n`;

    Object.entries(groupedAbsentees).forEach(([groupName, names]) => {
      message += `📍 *${groupName}*\n`;
      names.forEach((name) => {
        message += `\u2001• ${name}\n`;
      });
      message += `\n`;
    });

    message += `⚠️ *ጠቅላላ የቀሩ ተማሪዎች ብዛት:*\u2001${absentStudents.length}`;

    const payload = {
      chat_id: CHAT_ID,
      text: message.trim(),
      parse_mode: "Markdown",
    };

    if (TOPIC_ABSENT && !isNaN(parseInt(TOPIC_ABSENT, 10))) {
      payload.message_thread_id = parseInt(TOPIC_ABSENT, 10);
    }

    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      payload
    );

    return res.status(200).json({
      success: true,
      absentCount: absentStudents.length,
      message: "የቀሩት ተማሪዎች ዝርዝር ወደ ቴሌግራም ተልኳል።",
    });
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("Cron Execution Error:", errorDetails);
    return res.status(500).json({ error: "Failed to process absent list.", details: errorDetails });
  }
}

// Replace this mock with your database lookup when ready
async function getTodaySubmittedStudentNames() {
  return []; 
}