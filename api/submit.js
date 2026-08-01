// api/submit.js
import axios from "axios";

/**
 * Converts Gregorian Date to authentic Ethiopian Calendar Date (ዓ.ም.)
 */
function toEthiopianDate(date) {
  const ethMonths = [
    "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
  ];

  // Convert to East Africa Time (UTC+3)
  const eatTime = new Date(date.getTime() + 3 * 3600 * 1000);
  let year = eatTime.getUTCFullYear();
  let month = eatTime.getUTCMonth() + 1;
  let day = eatTime.getUTCDate();

  // Ethiopian new year starting day (Sept 11 or Sept 12 in leap years)
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const newYearDay = isLeap ? 12 : 11;

  let ethYear = year - 8;
  let ethMonth, ethDay;

  const newYearDate = new Date(Date.UTC(year, 8, newYearDay));

  if (eatTime < newYearDate) {
    ethYear = year - 8;
    const prevNewYearDay = ((year - 1) % 4 === 0) ? 12 : 11;
    const prevNewYear = new Date(Date.UTC(year - 1, 8, prevNewYearDay));
    const diffDays = Math.floor((eatTime - prevNewYear) / (1000 * 60 * 60 * 24));
    ethMonth = Math.floor(diffDays / 30) + 1;
    ethDay = (diffDays % 30) + 1;
  } else {
    ethYear = year - 7;
    const diffDays = Math.floor((eatTime - newYearDate) / (1000 * 60 * 60 * 24));
    ethMonth = Math.floor(diffDays / 30) + 1;
    ethDay = (diffDays % 30) + 1;
  }

  const monthName = ethMonths[ethMonth - 1] || "ነሐሴ";
  return `${monthName} ${ethDay} ቀን ${ethYear} ዓ.ም.`;
}

/**
 * Checks Telegram history to see if the student already submitted today.
 */
async function checkAlreadySubmitted(botToken, chatId, studentName) {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${botToken}/getUpdates`,
      { params: { limit: 100 } }
    );

    if (response.data?.ok && Array.isArray(response.data.result)) {
      const todayStr = new Date().toISOString().split("T")[0];
      const targetNameLower = studentName.trim().toLowerCase();

      return response.data.result.some((update) => {
        const msg = update.message || update.channel_post;
        if (!msg || !msg.text) return false;
        if (String(msg.chat.id) !== String(chatId)) return false;

        const msgDateStr = new Date(msg.date * 1000).toISOString().split("T")[0];
        return msgDateStr === todayStr && msg.text.toLowerCase().includes(targetNameLower);
      });
    }
  } catch (err) {
    console.error("Duplicate check error:", err.message);
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TOPIC_PRESENT = process.env.TELEGRAM_TOPIC_PRESENT;
    const TOPIC_PERMISSION = process.env.TELEGRAM_TOPIC_PERMISSION;

    // Toggle: Set ALLOW_MULTIPLE_SUBMISSIONS="false" in Vercel to reject 2nd attempt
    const allowMultiple = process.env.ALLOW_MULTIPLE_SUBMISSIONS !== "false";

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({
        success: false,
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID on environment variables.",
      });
    }

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

    if (!studentName || typeof studentName !== "string" || !studentName.trim()) {
      return res.status(400).json({
        success: false,
        error: "Student name is required.",
      });
    }

    // Single Submission Guard
    if (!allowMultiple) {
      const alreadySubmitted = await checkAlreadySubmitted(BOT_TOKEN, CHAT_ID, studentName);
      if (alreadySubmitted) {
        return res.status(400).json({
          success: false,
          error: "ለዛሬ ተመዝግበዋል! በድጋሚ መመዝገብ አይቻልም። (You have already submitted today!)",
        });
      }
    }

    // Format Date & Time strictly in Ethiopian Local Format
    const now = new Date();
    const ethiopianDateStr = toEthiopianDate(now);

    // Format Local Time (EAT Timezone)
    const ethiopianTimeStr = new Intl.DateTimeFormat("am-ET", {
      timeZone: "Africa/Addis_Ababa",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);

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

    const targetTopicEnv = isPermission ? TOPIC_PERMISSION : TOPIC_PRESENT;
    if (targetTopicEnv) {
      const topicId = parseInt(targetTopicEnv, 10);
      if (!isNaN(topicId) && topicId > 0) {
        payload.message_thread_id = topicId;
      }
    }

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