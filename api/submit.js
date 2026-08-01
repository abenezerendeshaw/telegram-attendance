// api/submit.js
import axios from "axios";

export default async function handler(req, res) {
  // 1. Allow only POST requests
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

    // 2. Extract student info
    const studentName =
      req.body.fullName ||
      req.body.selectedStudent?.name ||
      req.body.studentName ||
      req.body.name ||
      (typeof req.body.selectedStudent === "string" ? req.body.selectedStudent : null);

    const groupName =
      req.body.group ||
      req.body.selectedStudent?.group ||
      "ያልተመደበ";

    const { status, reason } = req.body;

    // 3. Validate student name
    if (!studentName || typeof studentName !== "string" || !studentName.trim()) {
      return res.status(400).json({
        success: false,
        error: "Student name is required.",
      });
    }

    // 4. Format Date & Time in Ethiopian / Addis Ababa Timezone
    const now = new Date();
    
    // Ethiopian/Amharic formatted Date (e.g., ነሐሴ 1, 2018)
    const ethiopianDateStr = new Intl.DateTimeFormat("am-ET", {
      timeZone: "Africa/Addis_Ababa",
      dateStyle: "full",
    }).format(now);

    // Ethiopian Time (e.g., 10:15:30 PM EAT)
    const ethiopianTimeStr = new Intl.DateTimeFormat("am-ET", {
      timeZone: "Africa/Addis_Ababa",
      timeStyle: "medium",
    }).format(now);

    // 5. Format Telegram Message
    const isPermission = status === "permission";
    const statusEmoji = isPermission ? "🟡" : "🟢";
    const statusText = isPermission ? "ፈቃድ (Permission)" : "ተገኝቷል (Present)";

    let message = `${statusEmoji} *የተማሪ አቴንዳንስ (Attendance Record)*\n\n`;
    message += `👤 *ስም:* ${studentName.trim()}\n`;
    message += `📍 *ክፍል/ቡድን:* ${groupName}\n`;
    message += `📊 *ሁኔታ:* ${statusText}\n`;
    message += `📅 *ቀን:* ${ethiopianDateStr}\n`;
    message += `⏰ *ሰዓት:* ${ethiopianTimeStr}\n`;

    if (reason && reason.trim()) {
      message += `📝 *ምክንያት:* ${reason.trim()}\n`;
    }

    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    };

    // 6. Attach topic thread ID if configured
    if (TOPIC_PRESENT) {
      const topicId = parseInt(TOPIC_PRESENT, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

    // 7. Send payload to Telegram Bot API
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
      error:
        error.response?.data?.description ||
        error.message ||
        "Internal Server Error",
    });
  }
}