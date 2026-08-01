import axios from "axios";
import { attendanceStore } from "../../lib/store.js";

// Helper to safely escape Markdown characters for Telegram API
function escapeMarkdown(text = "") {
  return text.replace(/[*_`[\]]/g, "\\$&");
}

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
  const monthIndex = Math.min(Math.max(ethMonth - 1, 0), 12);
  const monthName = ETHIOPIAN_MONTHS[monthIndex] || "መስከረም";

  return `${dayOfWeek}፣ ${monthName} ${ethDay} ቀን ${ethYear} ዓ.ም`;
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed", message: "Method Not Allowed" });
  }

  const now = new Date();

  // Robust parsing of East Africa Time (UTC+3)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    weekday: "short"
  });

  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const hours = parseInt(parts.hour === "24" ? "0" : parts.hour, 10);
  const minutes = parseInt(parts.minute, 10);
  const totalMinutes = hours * 60 + minutes;

  // Day mapping: 1 = Mon, 3 = Wed, 5 = Fri
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const dayOfWeek = dayMap[parts.weekday] ?? now.getDay();

  const isClassDay = [1, 3, 5].includes(dayOfWeek);
  
  // Window: 5:30 PM (1050 min) to 12:00 AM Midnight EAT
  const isWithinWindow = totalMinutes >= 1050 || totalMinutes === 0;

  if (process.env.ALLOW_OFFTIME_SUBMISSION !== "true" && (!isClassDay || !isWithinWindow)) {
    const errMsg = "የአቴንዳንስ መመዝገቢያ ክፍት የሚሆነው ሰኞ፣ ረቡዕ እና ዓርብ ከማታ 11:30 እስከ 2:30 ብቻ ነው።";
    return res.status(400).json({ error: errMsg, message: errMsg });
  }

  try {
    const { fullName, group, status, reason, latitude, longitude } = req.body;

    if (!fullName || !fullName.trim()) {
      const errMsg = "ሙሉ ስም ማስገባት አስፈላጊ ነው።";
      return res.status(400).json({ error: errMsg, message: errMsg });
    }

    if (status === "permission" && (!reason || !reason.trim())) {
      const errMsg = "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።";
      return res.status(400).json({ error: errMsg, message: errMsg });
    }

    if (status === "present" && process.env.DISABLE_GPS_CHECK !== "true") {
      if (!latitude || !longitude) {
        const errMsg = "ቦታዎን ማረጋገጥ አልተቻለም። እባክዎ የስልክዎን ቦታ (Location / GPS) ያብሩ።";
        return res.status(400).json({ error: errMsg, message: errMsg });
      }

      const CLASS_LAT = parseFloat(process.env.CLASS_LAT || "9.010211");
      const CLASS_LNG = parseFloat(process.env.CLASS_LNG || "38.761234");
      const MAX_DISTANCE = parseFloat(process.env.MAX_DISTANCE_METERS || "100");

      const distance = getDistanceInMeters(CLASS_LAT, CLASS_LNG, parseFloat(latitude), parseFloat(longitude));

      if (distance > MAX_DISTANCE) {
        const errMsg = `ከትምህርት ቦታ ውጪ መመዝገብ አይቻልም። አሁን ከትምህርት ቦታ ${Math.round(distance)} ሜትር ርቀው ይገኛሉ።`;
        return res.status(400).json({ error: errMsg, message: errMsg });
      }
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      const errMsg = "የሰርቨር ውቅር ስህተት አጋጥሟል።";
      return res.status(500).json({ error: errMsg, message: errMsg });
    }

    const ethioFormattedDate = getEthiopianDate(now);
    const formattedTime = now.toLocaleTimeString("am-ET", {
      timeZone: "Africa/Addis_Ababa",
      hour: "2-digit",
      minute: "2-digit"
    });

    const isPresent = status === "present";
    const statusText = isPresent ? "ተገኝቷል / ተገኝታለች" : "ፈቃድ ጠይቋል / ጠይቃለች";
    const groupText = group && group.trim() ? escapeMarkdown(group.trim()) : "ያልተጠቀሰ";
    const cleanFullName = escapeMarkdown(fullName.trim());

    let attendanceMessage = 
      `🎼 *የበገና ትምህርት ክፍል መገኘት መዝገብ*\n\n` +
      `👤 *ሙሉ ስም:*\u2001\u2001${cleanFullName}\n` +
      `📍 *ቡድን:*\u2001\u2001\u2001${groupText}\n` +
      `📊 *ሁኔታ:*\u2001\u2001\u2001${statusText}\n` +
      `📅 *ቀን:*\u2001\u2001\u2001\u2001${ethioFormattedDate}\n` +
      `⏰ *ሰዓት:*\u2001\u2001\u2001${formattedTime}`;

    if (!isPresent && reason && reason.trim()) {
      attendanceMessage += `\n📝 *ምክንያት:*\u2001\u2001${escapeMarkdown(reason.trim())}`;
    }

    const rawTopicId = isPresent
      ? process.env.TELEGRAM_TOPIC_PRESENT
      : process.env.TELEGRAM_TOPIC_PERMISSION;

    const payload = {
      chat_id: CHAT_ID,
      text: attendanceMessage,
      parse_mode: "Markdown",
    };

    if (rawTopicId) {
      const topicId = parseInt(rawTopicId, 10);
      if (!isNaN(topicId)) {
        payload.message_thread_id = topicId;
      }
    }

    if (attendanceStore && typeof attendanceStore.addStudent === "function") {
      attendanceStore.addStudent(fullName);
    }

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);

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