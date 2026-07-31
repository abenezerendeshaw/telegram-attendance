import { useState, useEffect } from "react";
import axios from "axios";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  // Optional: Auto-fill name if user opens this inside Telegram Mini App
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

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
      setStatus({ type: "error", message: "Please enter your full name." });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      await axios.post("/api/submit", { fullName });
      setStatus({ type: "success", message: "✅ Attendance marked successfully!" });
      setFullName(""); // Reset input

      // Close Telegram Mini App if open after 2 seconds
      if (window.Telegram?.WebApp) {
        setTimeout(() => {
          window.Telegram.WebApp.close();
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setStatus({
        type: "error",
        message: err.response?.data?.message || "Something went wrong. Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎓 Class Attendance</h1>
        <p style={styles.subtitle}>Mark yourself as Present for today's session.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (status.type) setStatus({ type: "", message: "" });
              }}
              placeholder="e.g. John Doe"
              style={styles.input}
            />
          </div>

          {status.message && (
            <p style={status.type === "error" ? styles.errorMsg : styles.successMsg}>
              {status.message}
            </p>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Marking Present..." : "MARK PRESENT"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Inline styles for rapid setup (no external CSS needed)
const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f1117",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    padding: "28px 24px",
    backdropFilter: "blur(10px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    textAlign: "center",
    margin: "0 0 6px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#a0a0a0",
    textAlign: "center",
    margin: "0 0 24px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
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
  },
  button: {
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#4274D9",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    marginTop: "8px",
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