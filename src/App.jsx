// src/App.jsx
import { useState, useEffect } from "react";
import axios from "axios";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    // Basic Telegram WebApp setup
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      // Optional: Auto-fill name if available
      const user = tg.initDataUnsafe?.user;
      if (user) {
        const telegramName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
        if (telegramName) setFullName(telegramName);
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setStatus({ type: "error", message: "እባክዎ ሙሉ ስምዎን ያስገቡ።" });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      // POST request to our Vercel Serverless Function
      await axios.post("/api/submit", { fullName });
      
      setStatus({ type: "success", message: "✅ መገኘትዎ በተሳካ ሁኔታ ተመዝግቧል!" });
      setFullName(""); // Clear input

      // Close the Web App after a short delay
      if (window.Telegram?.WebApp) {
        setTimeout(() => {
          window.Telegram.WebApp.close();
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setStatus({
        type: "error",
        message: err.response?.data?.message || "ስህተት አጋጥሟል። እባክዎ ድጋሚ ይሞክሩ።",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* NEW: Static Begena Image at the Top */}
        <img 
          src="/begena.png" // Referenced from the public/ folder
          alt="በገና (Begena)" 
          style={styles.topImage} 
        />

        <div style={styles.content}>
          <h1 style={styles.title}>የበገና ትምህርት መገኘት መዝገብ</h1>
          <p style={styles.subtitle}>ለዛሬው ክፍለ ጊዜ መገኘትዎን እዚህ ያረጋግጡ።</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>ሙሉ ስም</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (status.type) setStatus({ type: "", message: "" });
                }}
                placeholder="ምሳሌ፡ አበበ በቀለ"
                style={styles.input}
              />
            </div>

            {status.message && (
              <p style={status.type === "error" ? styles.errorMsg : styles.successMsg}>
                {status.message}
              </p>
            )}

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? "በመመዝገብ ላይ..." : "መገኘቴን አረጋግጥ"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Updated Styles
const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f1117", // Dark background
    color: "#ffffff",
    // Prioritize Noto Sans Ethiopic for Amharic text
    fontFamily: "'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "rgba(255, 255, 255, 0.05)", // Semi-transparent glass effect
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    overflow: "hidden", // Important for image corners
    backdropFilter: "blur(10px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  topImage: {
    width: "100%",
    height: "200px", // Fixed height for the top banner
    objectFit: "cover", // Ensures the image fills the area well
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  },
  content: {
    padding: "24px",
    textAlign: "center",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 6px 0",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: "13px",
    color: "#a0a0a0",
    margin: "0 0 24px 0",
    lineHeight: "1.4",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    textAlign: "left",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "500",
    color: "#cccccc",
  },
  input: {
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  button: {
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#d97706", // Amber/Gold color
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    marginTop: "8px",
    transition: "background-color 0.2s",
  },
  errorMsg: {
    fontSize: "13px",
    color: "#ff6b6b",
    margin: "0",
  },
  successMsg: {
    fontSize: "13px",
    color: "#51cf66",
    margin: "0",
  },
};