// api/receipt.js
import axios from "axios";
import FormData from "form-data";
import { google } from "googleapis";

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

  const isGregorianLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const ethNewYearDay = isGregorianLeap ? 12 : 11;
  const afterNewYear = month > 9 || (month === 9 && day >= ethNewYearDay);
  let ethYear = afterNewYear ? year - 7 : year - 8;

  const gregorianMonths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) {
    gregorianMonths[2] = 29;
  }

  let dayOfYear = day;
  for (let m = 1; m < month; m++) dayOfYear += gregorianMonths[m];

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

async function appendReceiptToSheet({ fullName, receiptNumber, date, time }) {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson || !sheetId) {
    console.warn('[Sheets] Skipping — no GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SHEET_ID');
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  } catch (e) {
    console.error('[Sheets] Failed to parse credentials:', e.message);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[fullName, receiptNumber, date, time]] },
    });
  } catch (e) {
    console.error('[Sheets] Failed to append receipt row:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const { fullName, receiptNumber, imageData } = req.body;
    if (!fullName || !fullName.trim()) return res.status(400).json({ message: "Full name is required" });
    if (!receiptNumber || !receiptNumber.trim()) return res.status(400).json({ message: "Receipt number is required" });
    if (!imageData || typeof imageData !== 'string') return res.status(400).json({ message: "Image is required" });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TOPIC = process.env.TELEGRAM_TOPIC_RECEPT;

    if (!BOT_TOKEN || !CHAT_ID) return res.status(500).json({ message: "Server configuration error" });

    // Parse data URL
    const matches = imageData.match(/^data:(.+);base64,(.+)$/);
    let buffer;
    if (matches) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // If raw base64 was provided
      buffer = Buffer.from(imageData, 'base64');
    }

    const now = new Date();
    const ethioFormattedDate = getEthiopianDate(now);
    const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const eatHour = eatDate.getUTCHours();
    const eatMinute = eatDate.getUTCMinutes();
    const ethHour = ((eatHour - 6 + 24) % 12) || 12;
    const ethPeriod = (eatHour >= 6 && eatHour < 18) ? "ቀን" : "ማታ";
    const formattedTime = `${ethHour}:${String(eatMinute).padStart(2, '0')} ${ethPeriod}`;

    // Send photo to Telegram topic
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    if (TOPIC) form.append('message_thread_id', TOPIC);
    const caption = `📤 *Receipt Submission*\n👤 ${fullName.trim()}\n🔢 Receipt #: ${receiptNumber.trim()}`;
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');
    form.append('photo', buffer, { filename: 'receipt.jpg' });

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    // Append to Google Sheet
    await appendReceiptToSheet({ fullName: fullName.trim(), receiptNumber: receiptNumber.trim(), date: ethioFormattedDate, time: formattedTime });

    return res.status(200).json({ success: true, message: 'Receipt submitted' });
  } catch (e) {
    console.error('Receipt handler error:', e.response?.data || e.message || e);
    return res.status(500).json({ message: 'Failed to submit receipt', error: e.response?.data || e.message });
  }
}
