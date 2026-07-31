// api/cron/mark-absents.js
import axios from "axios";
import { STUDENTS } from "../../src/students.js";

// In-memory or database check logic
// Note: On serverless environments, state resetting depends on your data store.
// If you are storing attendance in a database (e.g., Supabase, MongoDB, Postgres), 
// query today's records from there. Below is the full process structure.

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
  for (let m = 1; m < month; m++) dayOfYear += gregorianMonths[m];

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

  return `${ETHIOPIAN_DAYS[date.getDay()]}፣ ${ETHIOPIAN_MONTHS[Math.min(ethMonth - 1, 12)]} ${ethDay} ቀን ${ethYear} ዓ.ም`;
}

export default async function handler(req, res) {
  // 1. Verify Authorization (Prevent public execution)
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ message: "Unauthorized Cron Execution" });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const ABSENT_TOPIC_ID = process.env.TELEGRAM_TOPIC_ABSENT;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "Telegram configuration missing." });
    }

    // 2. Fetch or retrieve today's attendees (Replace this mock with your DB fetch if using Supabase/Firebase)
    // Example: const submittedToday = await db.getTodaySubmissions();
    const submittedNames = new Set([]); // Names who checked in today

    // 3. Filter absent students
    const absentStudents = STUDENTS.filter(
      (student) => !submittedNames.has(student.name.trim().toLowerCase())
    );

    if (absentStudents.length === 0) {
      return res.status(200).json({ message: "No absent students today!" });
    }

    // 4. Group absent students by Group Name
    const groupedAbsents = absentStudents.reduce((acc, student) => {
      const grp = student.group || "ያልተመደበ";
      if (!acc[grp]) acc[grp] = [];
      acc[grp].push(student.name);
      return acc;
    }, {});

    // 5. Build Amharic Summary Message
    const ethioDate = getEthiopianDate(new Date());
    let message = `⚠️ *የዛሬ የቀሩ ተማሪዎች መዝገብ (Absent List)*\n📅 *ቀን:* ${ethioDate}\n\n`;
    message += `❌ *ጠቅላላ የቀሩ ተማሪዎች ብዛት:* ${absentStudents.length}\n`;
    message += `──────────────────────\n\n`;

    for (const [groupName, names] of Object.entries(groupedAbsents)) {
      message += `📍 *${groupName}* (${names.length} ተማሪዎች):\n`;
      names.forEach((name, index) => {
        message += `  ${index + 1}. ${name}\n`;
      });
      message += `\n`;
    }

    // 6. Send to Telegram
    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    };

    if (ABSENT_TOPIC_ID) {
      const topicId = parseInt(ABSENT_TOPIC_ID, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);

    return res.status(200).json({
      success: true,
      totalAbsents: absentStudents.length,
      message: "Absent summary posted to Telegram successfully.",
    });
  } catch (error) {
    console.error("Cron Error:", error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
}