// api/webhook.js
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Telegram Webhook active!");
  }

  try {
    const { message } = req.body;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const WEB_APP_URL = "https://telegram-attendance-dzbz.vercel.app/";

    if (message && message.text) {
      const chatId = message.chat.id;
      const text = message.text;
      const firstName = message.from?.first_name || "ወዳጃችን";

      if (text.startsWith("/start") || text.startsWith("/help")) {
        const welcomeMessage = `
ወደ *የበገና ትምህርት መገኘት መመዝገቢያ ቦት* እንኳን በደህና መጡ! 🎼

ሰላም ${firstName} 👋

በዚህ ቦት አማካኝነት የዘወትር የበገና ትምህርት ክፍለ ጊዜ መገኘትዎን በቀላሉ መመዝገብ ይችላሉ።

👇 **መገኘትዎን ለመመዝገብ ከታች ያለውን ቁልፍ ይጫኑ:**
        `.trim();

        // Send Welcome Message with Inline WebApp Button
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: welcomeMessage,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📝 መገኘት መዝግብ (Mark Attendance)",
                  web_app: { url: WEB_APP_URL },
                },
              ],
            ],
          },
        });
      } else {
        // Friendly fallback for any other message
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `👋 ሰላም ${firstName}!\n\nመገኘትዎን ለመመዝገብ ከታች ያለውን ቁልፍ ይጫኑ። 👇`,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📝 መገኘት መዝግብ (Mark Attendance)",
                  web_app: { url: WEB_APP_URL },
                },
              ],
            ],
          },
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(200).json({ ok: true });
  }
}