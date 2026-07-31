// api/cron/mark-absents.js
import axios from "axios";
import { STUDENTS } from "../../src/students.js";

/**
 * Extracts student names from Telegram message texts posted today.
 */
async function getSubmittedNamesFromTelegram(botToken, chatId) {
  const submittedNames = new Set();

  try {
    // Fetch recent updates/messages sent to the bot/group
    const response = await axios.get(
      `https://api.telegram.org/bot${botToken}/getUpdates`,
      { params: { limit: 100 } }
    );

    if (response.data?.ok && Array.isArray(response.data.result)) {
      const updates = response.data.result;
      const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC

      updates.forEach((update) => {
        const msg = update.message || update.channel_post;
        if (!msg || !msg.text) return;

        // Ensure message belongs to your attendance chat
        if (String(msg.chat.id) !== String(chatId)) return;

        // Ensure message was sent today
        const msgDateStr = new Date(msg.date * 1000).toISOString().split("T")[0];
        if (msgDateStr !== todayStr) return;

        // Match student names against your STUDENTS database list
        const textLower = msg.text.toLowerCase();
        STUDENTS.forEach((student) => {
          const studentNameLower = student.name.trim().toLowerCase();
          if (textLower.includes(studentNameLower)) {
            submittedNames.add(studentNameLower);
          }
        });
      });
    }
  } catch (err) {
    console.error("Failed to read updates from Telegram:", err.message);
  }

  return submittedNames;
}

export default async function handler(req, res) {
  // 1. Authorization & Testing Flag Check
  const isTest = req.query.test === "true";
  const authHeader = req.headers.authorization;
  const isVercelCron =
    process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && !isVercelCron && !isTest) {
    return res.status(401).json({ message: "Unauthorized Cron Execution" });
  }

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const ABSENT_TOPIC_ID = process.env.TELEGRAM_TOPIC_ABSENT;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.",
      });
    }

    // 2. Read registered student names directly from Telegram
    let submittedNames = await getSubmittedNamesFromTelegram(BOT_TOKEN, CHAT_ID);

    // Allow manual URL overrides for quick testing via ?submitted=Name1,Name2
    if (req.query.submitted) {
      req.query.submitted.split(",").forEach((name) => {
        submittedNames.add(name.trim().toLowerCase());
      });
    }

    // 3. Filter absent students
    const absentStudents = STUDENTS.filter(
      (s) => !submittedNames.has(s.name.trim().toLowerCase())
    );

    if (absentStudents.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ሁሉም ተማሪዎች ተመዝግበዋል። የቀረ የለም! (All students accounted for today)",
      });
    }

    // 4. Group remaining absent students by group name
    const groupedAbsents = absentStudents.reduce((acc, student) => {
      const grp = student.group || "ያልተመደበ";
      if (!acc[grp]) acc[grp] = [];
      acc[grp].push(student.name);
      return acc;
    }, {});

    // 5. Build Markdown Summary Message
    let message = `⚠️ *የዛሬ የቀሩ ተማሪዎች መዝገብ (Absent List)*\n\n`;
    message += `❌ *ጠቅላላ የቀሩ ተማሪዎች:* ${absentStudents.length}\n`;
    message += `──────────────────────\n\n`;

    for (const [groupName, names] of Object.entries(groupedAbsents)) {
      message += `📍 *${groupName}* (${names.length} ተማሪዎች):\n`;
      names.forEach((name, i) => {
        message += `  ${i + 1}. ${name}\n`;
      });
      message += `\n`;
    }

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

    // 6. Post absent report to Telegram
    const telegramRes = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      payload
    );

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalStudents: STUDENTS.length,
        submittedCount: submittedNames.size,
        totalAbsents: absentStudents.length,
      },
      detectedSubmittedNames: Array.from(submittedNames),
      groupedAbsents,
      telegramStatus: {
        ok: telegramRes.data.ok,
        messageId: telegramRes.data.result?.message_id,
      },
    });
  } catch (error) {
    console.error("Cron Execution Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
}