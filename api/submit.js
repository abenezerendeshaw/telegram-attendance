import axios from "axios";

export default async function handler(req, res) {
  // 1. Restrict to POST method only
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { fullName } = req.body;

    // 2. Input validation
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "Full name is required." });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("Missing Telegram environment variables.");
      return res.status(500).json({ message: "Server configuration error." });
    }

    // 3. Format automatic date & time in local format
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // 4. Construct Telegram message payload
    const attendanceMessage = `
📋 *CLASS ATTENDANCE RECORD*

👤 *Name:* ${fullName.trim()}
✅ *Status:* Present
📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
    `.trim();

    // 5. Send payload to Telegram Channel via Bot API
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    });

    return res.status(200).json({ success: true, message: "Attendance marked successfully!" });
  } catch (error) {
    console.error("Telegram API Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Failed to record attendance.",
      error: error.message,
    });
  }
}