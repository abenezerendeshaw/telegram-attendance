// src/App.jsx
import { useState, useEffect } from "react";
import axios from "axios";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  
  // 24-hour Lock States
  const [isLocked, setIsLocked] = useState(false);
  const [hoursLeft, setHoursLeft] = useState(0);

  useEffect(() => {
    // Check 24-hour lock status
    const checkLockStatus = () => {
      const lastSubmission = localStorage.getItem("last_attendance_timestamp");
      if (lastSubmission) {
        const now = Date.now();
        const timePassed = now - parseInt(lastSubmission, 10);
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (timePassed < twentyFourHours) {
          const remainingMs = twentyFourHours - timePassed;
          const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
          setIsLocked(true);
          setHoursLeft(remainingHours);
        } else {
          setIsLocked(false);
        }
      }
    };

    checkLockStatus();

    // Telegram WebApp Setup
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

    if (isLocked) {
      setStatus({
        type: "error",
        message: `ከዚህ ቀደም ተመዝግበዋል። እባክዎ ከ ${hoursLeft} ሰዓታት በኋላ ድጋሚ ይሞክሩ።`,
      });
      return;
    }

    if (!fullName.trim()) {
      setStatus({ type: "error", message: "እባክዎ ሙሉ ስምዎን ያስገቡ።" });
      return;
    }

    if (attendanceStatus === "permission" && !reason.trim()) {
      setStatus({ type: "error", message: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።" });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      await axios.post("/api/submit", {
        fullName,
        status: attendanceStatus,
        reason: attendanceStatus === "permission" ? reason : "",
      });

      // Set 24 hour cooldown lock
      const nowTimestamp = Date.now();
      localStorage.setItem("last_attendance_timestamp", nowTimestamp.toString());
      setIsLocked(true);
      setHoursLeft(24);

      setStatus({ type: "success", message: "✅ መረጃዎ በተሳካ ሁኔታ ተመዝግቧል!" });

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
        <img src="/begena.png" alt="በገና (Begena)" style={styles.topImage} />

        <div style={styles.content}>
          <h1 style={styles.title}>የበገና ትምህርት መገኘት መዝገብ</h1>
          <p style={styles.subtitle}>ለዛሬው ክፍለ ጊዜ መገኘትዎን ወይም ፈቃድዎን እዚህ ያረጋግጡ።</p>

          {isLocked ? (
            <div style={styles.lockNotice}>
              <div style={styles.lockIcon}>⏳</div>
              <h3 style={styles.lockTitle}>ለዛሬ መዝግበዋል!</h3>
              <p style={styles.lockText}>
                የዛሬው መገኘትዎ በተሳካ ሁኔታ ተመዝግቧል። የሚቀጥለውን መዝገብ ለማስገባት ከ <strong>{hoursLeft} ሰዓታት</strong> በኋላ ድጋሚ ይሞክሩ።
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              {/* Full Name Field */}
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

              {/* Attendance Status Dropdown */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>የመገኘት ሁኔታ</label>
                <select
                  value={attendanceStatus}
                  onChange={(e) => {
                    setAttendanceStatus(e.target.value);
                    if (status.type) setStatus({ type: "", message: "" });
                  }}
                  style={styles.select}
                >
                  <option value="present">ተገኝቷል / ተገኝታለች</option>
                  <option value="permission">ፈቃድ ጠይቋል / ጠይቃለች</option>
                </select>
              </div>

              {/* Conditional Reason Field */}
              {attendanceStatus === "permission" && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>የፈቃድ ምክንያት</label>
                  <textarea
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (status.type) setStatus({ type: "", message: "" });
                    }}
                    placeholder="እባክዎ የፈቃድዎን ምክንያት እዚህ ይፃፉ..."
                    rows={3}
                    style={styles.textarea}
                  />
                </div>
              )}

              {status.message && (
                <p style={status.type === "error" ? styles.errorMsg : styles.successMsg}>
                  {status.message}
                </p>
              )}

              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? "በመመዝገብ ላይ..." : "መረጃውን መዝግብ"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f1117",
    color: "#ffffff",
    fontFamily: "'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    overflow: "hidden",
    backdropFilter: "blur(10px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  topImage: {
    width: "100%",
    height: "190px",
    objectFit: "cover",
    objectPosition: "center 20%",
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
  },
  lockNotice: {
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    border: "1px solid rgba(217, 119, 6, 0.3)",
    borderRadius: "12px",
    padding: "24px 16px",
    marginTop: "12px",
  },
  lockIcon: {
    fontSize: "36px",
    marginBottom: "8px",
  },
  lockTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#f59e0b",
    margin: "0 0 8px 0",
  },
  lockText: {
    fontSize: "13px",
    color: "#d1d5db",
    margin: "0",
    lineHeight: "1.5",
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
  },
  select: {
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "#1f2430",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "15px",
    outline: "none",
    cursor: "pointer",
  },
  textarea: {
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
  },
  button: {
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#d97706",
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