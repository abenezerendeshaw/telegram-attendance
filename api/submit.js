// api/submit.js
import axios from "axios";

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TOPIC_PRESENT = process.env.TELEGRAM_TOPIC_PRESENT;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({
        success: false,
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID on Vercel environment variables.",
      });
    }

    const { selectedStudent, status, reason, location } = req.body;

    if (!selectedStudent || !selectedStudent.name) {
      return res.status(400).json({ success: false, error: "Student name is required." });
    }

    // Prepare Telegram message
    const isPermission = status === "permission";
    const statusEmoji = isPermission ? "🟡" : "🟢";
    const statusText = isPermission ? "ፈቃድ (Permission)" : "ተገኝቷል (Present)";

    let message = `${statusEmoji} *የተማሪ አቴንዳንስ (Attendance Record)*\n\n`;
    message += `👤 *ስም:* ${selectedStudent.name}\n`;
    message += `📍 *ክፍል/ቡድን:* ${selectedStudent.group || "ያልተመደበ"}\n`;
    message += `📊 *ሁኔታ:* ${statusText}\n`;

    if (reason && reason.trim()) {
      message += `📝 *ምክንያት:* ${reason.trim()}\n`;
    }

    if (location && location.latitude) {
      message += `🌐 *Location:* [View Map](https://maps.google.com/?q=${location.latitude},${location.longitude})\n`;
    }

    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    };

    // Send to specific topic if TELEGRAM_TOPIC_PRESENT is set
    if (TOPIC_PRESENT) {
      const topicId = parseInt(TOPIC_PRESENT, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

    // Send submission to Telegram
    const telegramRes = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Attendance recorded successfully!",
      telegramMessageId: telegramRes.data.result?.message_id,
    });
  } catch (error) {
    console.error("Submit API Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      error: error.response?.data?.description || error.message || "Internal Server Error",
    });
  }
}