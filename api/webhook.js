// api/webhook.js
import axios from "axios";

export default async function handler(req, res) {
  // Only accept POST requests from Telegram
  if (req.method !== "POST") {
    return res.status(200).send("Telegram Webhook active!");
  }

  try {
    const { message } = req.body;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    // Check if user sent a message (e.g., pressed /start or joined)
    if (message && message.text) {
      const chatId = message.chat.id;
      const text = message.text;
      const firstName = message.from?.first_name || "ወዳጃችን";

      // Respond when user sends /start
      if (text.startsWith("/start")) {
        const welcomeMessage = `
ወደ *የበገና ትምህርት መገኘት መመዝገቢያ ቦት* እንኳን በደህና መጡ! 🎼

ሰላም ${firstName} 👋

በዚህ ቦት አማካኝነት የዘወትር የበገና ትምህርት ክፍለ ጊዜ መገኘትዎን በቀላሉ መመዝገብ ይችላሉ።

👇 **መገኘት ለመመዝገብ:**
ታችኛው በኩል የሚገኘውን **"Mark Attendance"** (ወይም **"መገኘት መዝግብ"**) የሚለውን ቁልፍ ይጫኑ።
        `.trim();

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: welcomeMessage,
          parse_mode: "Markdown",
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(200).json({ ok: true }); // Always return 200 OK so Telegram doesn't retry infinitely
  }
}