// api/cron/mark-absents.js
import axios from "axios";
import { STUDENTS } from "../../src/students.js";
import { attendanceStore } from "../../lib/store.js";

export default async function handler(req, res) {
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
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables.",
      });
    }

    // 1. Get real names of students who registered today
    const submittedNames = attendanceStore.getSubmittedNames();

    // 2. Filter ONLY students who DID NOT submit today
    const absentStudents = STUDENTS.filter(
      (s) => !submittedNames.has(s.name.trim().toLowerCase())
    );

    if (absentStudents.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ሁሉም ተማሪዎች ተመዝግበዋል። የቀረ የለም! (All students present/permitted today)",
      });
    }

    // 3. Group absent students by group name
    const groupedAbsents = absentStudents.reduce((acc, student) => {
      const grp = student.group || "ያልተመደበ";
      if (!acc[grp]) acc[grp] = [];
      acc[grp].push(student.name);
      return acc;
    }, {});

    // 4. Format Telegram Markdown Message
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

    // 5. Send message to Telegram
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
      submittedNames: Array.from(submittedNames),
      groupedAbsents,
      telegramStatus: {
        ok: telegramRes.data.ok,
        messageId: telegramRes.data.result?.message_id,
      },
    });
  } catch (error) {
    console.error("Cron Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
}