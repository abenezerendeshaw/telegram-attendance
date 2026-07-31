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

  try {
    const { fullName, status, reason } = req.body;

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

    const now = new Date();
    const ethioFormattedDate = getEthiopianDate(now);
    const formattedTime = now.toLocaleTimeString("am-ET", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const isPresent = status === "present";
    const statusText = isPresent ? "ተገኝቷል / ተገኝታለች" : "ፈቃድ ጠይቋል / ጠይቃለች";
    
    // Telegram Message Output Format
    let attendanceMessage = `
🎼 *የበገና ትምህርት ክፍል መገኘት መዝገብ*

👤 *ሙሉ ስም:* ${fullName.trim()}
✅ *ሁኔታ:* ${statusText}
📅 *ቀን:* ${ethioFormattedDate}
⏰ *ሰዓት:* ${formattedTime}
`.trim();

    // Attach reason when present
    if (!isPresent && reason && reason.trim()) {
      attendanceMessage += `\n💬 *ምክንያት:* ${reason.trim()}`;
    }

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    });

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