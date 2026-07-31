// api/submit.js
import axios from "axios";

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

    // Amharic Date & Time formatting
    const now = new Date();
    const formattedDate = now.toLocaleDateString("am-ET", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("am-ET", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Amharic Attendance Message Format (Text Only)
    const attendanceMessage = `
🎼 *የበገና ትምህርት ክፍል መገኘት መዝገብ*

👤 *ሙሉ ስም:* ${fullName.trim()}
✅ *ሁኔታ:* ተገኝቷል / ተገኝታለች
📅 *ቀን:* ${formattedDate}
⏰ *ሰዓት:* ${formattedTime}
    `.trim();

    // Send Text Message to Telegram Group
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    });

    return res.status(200).json({ success: true, message: "መገኘትዎ በተካከለ ተመዝግቧል!" });
  } catch (error) {
    console.error("Telegram API Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "መገኘት መመዝገብ አልተቻለም።",
      error: error.response?.data || error.message,
    });
  }
}