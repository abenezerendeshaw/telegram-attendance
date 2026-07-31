// api/submit.js
import axios from "axios";
import { toEthiopic } from "ethiopian-date";

// Ethiopian month names in Amharic
const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
];

// Ethiopian weekdays in Amharic
const ETHIOPIAN_DAYS = [
  "እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { fullName } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "ሙሉ ስም ማስገባት አስፈላጊ ነው።" });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ message: "የሰርቨር ውቅር ስህተት አጋጥሟል።" });
    }

    const now = new Date();
    
    // Convert Gregorian Date to Ethiopian Date
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1 - 12
    const day = now.getDate();

    const [ethYear, ethMonth, ethDay] = toEthiopic(year, month, day);
    
    const dayOfWeek = ETHIOPIAN_DAYS[now.getDay()];
    const monthName = ETHIOPIAN_MONTHS[ethMonth - 1];

    // Formatted Ethiopian Date String (e.g. ሐሙስ፣ ሐምሌ 24 ቀን 2018 ዓ.ም)
    const ethioFormattedDate = `${dayOfWeek}፣ ${monthName} ${ethDay} ቀን ${ethYear} ዓ.ም`;

    // Localized Time Format
    const formattedTime = now.toLocaleTimeString("am-ET", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Attendance Telegram Message
    const attendanceMessage = `
🎼 *የበገና ትምህርት ክፍል መገኘት መዝገብ*

👤 *ሙሉ ስም:* ${fullName.trim()}
✅ *ሁኔታ:* ተገኝቷል / ተገኝታለች
📅 *ቀን:* ${ethioFormattedDate}
⏰ *ሰዓት:* ${formattedTime}
    `.trim();

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    });

    return res.status(200).json({ success: true, message: "መገኘትዎ በተሳካ ሁኔታ ተመዝግቧል!" });
  } catch (error) {
    console.error("Telegram API Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "መገኘት መመዝገብ አልተቻለም።",
      error: error.response?.data || error.message,
    });
  }
}