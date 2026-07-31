// api/submit.js
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
  if (month < 9 || (month === 9 && day < 11)) {
    ethYear -= 1;
  }

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
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // --- Class Time Window Validation ---
  const now = new Date();
  const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC + 3
  const dayOfWeek = eatDate.getUTCDay(); // 1 = Mon, 3 = Wed, 5 = Fri
  const totalMinutes = eatDate.getUTCHours() * 60 + eatDate.getUTCMinutes();

  const isClassDay = [1, 3, 5].includes(dayOfWeek);
  // 5:30 PM (17:30 = 1050 mins) to 8:30 PM (20:30 = 1230 mins) EAT
  const isWithinWindow = totalMinutes >= 1050 && totalMinutes <= 1230;

  // Set ALLOW_OFFTIME_SUBMISSION=true in .env if you want to bypass this limit for testing
  if (process.env.ALLOW_OFFTIME_SUBMISSION !== "true" && (!isClassDay || !isWithinWindow)) {
    return res.status(400).json({
      message: "የመገኘት መመዝገቢያ ክፍት የሚሆነው ሰኞ፣ ረቡዕ እና ዓርብ ከማታ 11:30 እስከ 2:30 ብቻ ነው።",
    });
  }
  // ------------------------------------

  try {
    const { fullName, group, status, reason } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "ሙሉ ስም ማስገባት አስፈላጊ ነው።" });
    }

    if (status === "permission" && (!reason || !reason.trim())) {
      return res.status(400).json({ message: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።" });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "የሰርቨር ውቅር ስህተት አጋጥሟል።" });
    }

    const ethioFormattedDate = getEthiopianDate(now);
    const formattedTime = now.toLocaleTimeString("am-ET", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const isPresent = status === "present";
    const statusText = isPresent ? "ተገኝቷል / ተገኝታለች" : "ፈቃድ ጠይቋል / ጠይቃለች";
    const groupText = group && group.trim() ? group.trim() : "ያልተጠቀሰ";

    // Formatted message output with tab-like spacing (\u2001)
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

    // Select Raw Topic ID
    const rawTopicId = isPresent
      ? process.env.TELEGRAM_TOPIC_PRESENT
      : process.env.TELEGRAM_TOPIC_PERMISSION;

    const payload = {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    };

    // Attach message_thread_id safely if configured
    if (rawTopicId) {
      const topicId = parseInt(rawTopicId, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);

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