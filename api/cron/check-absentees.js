// api/cron/check-absentees.js
import axios from "axios";
import { STUDENTS } from "../../src/students"; // Master roster list

// Ethiopian Date Converter
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

export default async function handler(req, res) {
  // 1. Verify Vercel Cron authorization header or allow manual testing in dev
  const authHeader = req.headers.authorization;
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ message: "Unauthorized request." });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TOPIC_ABSENT = process.env.TELEGRAM_TOPIC_ABSENT;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "Missing Telegram configuration." });
    }

    // 2. Fetch today's submission logs from your database (or replace with your storage fetch)
    // For illustration, replace `getTodaySubmissions()` with your database query
    const todaySubmissions = await getTodaySubmittedStudentNames(); 

    // 3. Filter master list against present/permitted submissions to get absentees
    const submittedNameSet = new Set(
      todaySubmissions.map((name) => name.trim().toLowerCase())
    );

    const absentStudents = STUDENTS.filter(
      (s) => !submittedNameSet.has(s.name.trim().toLowerCase())
    );

    // If everyone attended or submitted permission
    if (absentStudents.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ሁሉም ተማሪዎች ተመዝግበዋል። ምንም የቀረ የለም!",
      });
    }

    // 4. Group absentees by their group name
    const groupedAbsentees = absentStudents.reduce((acc, student) => {
      const group = student.group || "ያልተመደበ";
      if (!acc[group]) acc[group] = [];
      acc[group].push(student.name);
      return acc;
    }, {});

    // 5. Build output message for Telegram
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

    // 6. Post to Telegram absent topic
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
    console.error("Cron Execution Error:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to process absent list." });
  }
}

// Dummy helper function – replace with your real database query (e.g. Supabase, Firebase, KV)
async function getTodaySubmittedStudentNames() {
  // Example SQL/ORM pseudo query:
  // SELECT full_name FROM submissions WHERE DATE(created_at) = CURRENT_DATE;
  return []; 
}