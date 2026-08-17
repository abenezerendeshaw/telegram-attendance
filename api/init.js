// api/init.js
import { google } from "googleapis";
import { STUDENTS } from "../src/students.js";

async function getSheetsClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

  const credentials = JSON.parse(credentialsJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Init endpoint active");
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ success: false, message: "GOOGLE_SHEET_ID not set" });

    // Ensure Students tab
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
    const existingTabs = (meta.data.sheets || []).map((s) => s.properties.title);

    if (!existingTabs.includes("Students")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: "Students" } } }] },
      });
    }

    const rows = STUDENTS.map((s) => [s.name || "", s.englishName || "", s.group || ""]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Students!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["name", "englishName", "group"], ...rows] },
    });

    // Ensure Sheet1 has header row for base columns A-E
    const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Sheet1!1:1" });
    const headers = (headerResp.data.values && headerResp.data.values[0]) || [];
    const baseHeaders = ["ሙሉ ስም", "ቡድን", "ሁኔታ", "ቀን", "ሰዓት"];
    let needUpdate = false;

    for (let i = 0; i < baseHeaders.length; i++) {
      if ((headers[i] || "").toString().trim() !== baseHeaders[i]) {
        needUpdate = true;
        break;
      }
    }

    if (needUpdate) {
      // Write base headers into A1:E1
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1:E1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [baseHeaders] },
      });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("[Init] Error:", e.message, e.response?.data || "");
    return res.status(500).json({ success: false, error: e.message });
  }
}
