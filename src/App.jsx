// src/App.jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { STUDENTS } from "./students";

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  // 24-hour Lock State
  const [isLocked, setIsLocked] = useState(false);
  const [hoursLeft, setHoursLeft] = useState(0);

  const dropdownRef = useRef(null);

  useEffect(() => {
    // Check local storage for existing submission within the last 24 hours
    const checkLockStatus = () => {
      const lastSubmission = localStorage.getItem("last_attendance_timestamp");
      if (lastSubmission) {
        const now = Date.now();
        const timePassed = now - parseInt(lastSubmission, 100);
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (timePassed < twentyFourHours) {
          const remainingMs = twentyFourHours - timePassed;
          const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
          setIsLocked(false);
          setHoursLeft(remainingHours);
        } else {
          setIsLocked(false);
        }
      }
    };

    checkLockStatus();

    // Close the autocomplete dropdown when clicking outside
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    // Initialize Telegram WebApp viewport if running inside Telegram
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter students by matching input against Amharic name OR English phonetic string
  const filteredStudents = STUDENTS.filter((s) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    const matchesAmharic = s.name.includes(query);
    const matchesEnglish = s.englishName?.toLowerCase().includes(query);
    return matchesAmharic || matchesEnglish;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLocked) {
      setStatus({
        type: "error",
        message: `ከዚህ ቀደም ተመዝግበዋል። እባክዎ ከ ${hoursLeft} ሰዓታት በኋላ ድጋሚ ይሞክሩ።`,
      });
      return;
    }

    if (!selectedStudent) {
      setStatus({
        type: "error",
        message: "እባክዎ ስምዎን ከተዘረዘሩት ውስጥ ይፈልጉና ይምረጡ።",
      });
      return;
    }

    if (attendanceStatus === "permission" && !reason.trim()) {
      setStatus({
        type: "error",
        message: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።",
      });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });

    // GPS capture for "present"
    let coords = {};
    if (attendanceStatus === "present") {
      if (!navigator.geolocation) {
        setStatus({
          type: "error",
          message: "ጂፒኤስ (GPS) በስልክዎ ላይ አይሰራም። እባክዎ በሌላ ስልክ ይሞክሩ።",
        });
        setLoading(false);
        return;
      }

      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch (geoErr) {
        setLoading(false);
        let errorMsg = "ቦታዎን ሳያረጋግጡ መመዝገብ አይችሉም።";
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          errorMsg = "እባክዎ ስልክዎ ላይ የቦታ (Location) ፈቃድ ይስጡ።";
        }
        setStatus({ type: "error", message: errorMsg });
        return;
      }
    }

    try {
      await axios.post("/api/submit", {
        fullName: selectedStudent.name,
        group: selectedStudent.group,
        status: attendanceStatus,
        reason: attendanceStatus === "permission" ? reason : "",
        ...coords,
      });

      // Record timestamp to enforce 24-hour check
      const nowTimestamp = Date.now();
      localStorage.setItem("last_attendance_timestamp", nowTimestamp.toString());
      setIsLocked(true);
      setHoursLeft(24);

      setStatus({ type: "success", message: "✅ መረጃዎ በተሳካ ሁኔታ ተመዝግቧል!" });

      // Close Telegram WebApp window automatically if embedded
      if (window.Telegram?.WebApp) {
        setTimeout(() => {
          window.Telegram.WebApp.close();
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setStatus({
        type: "error",
        message:
          err.response?.data?.message || "ስህተት አጋጥሟል። እባክዎ ድጋሚ ይሞክሩ።",
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
          <p style={styles.subtitle}>
            ለዛሬው ክፍለ ጊዜ መገኘትዎን ወይም ፈቃድዎን እዚህ ያረጋግጡ።
          </p>

          {/* Interface stays completely intact and interactive */}
          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Bilingual Search Container */}
            <div style={styles.inputGroup} ref={dropdownRef}>
              <label style={styles.label}>ስምዎን ይፈልጉ / Search Name</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="በአማርኛ ወይም በEnglish ይፃፉ..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSelectedStudent(null);
                    setIsOpen(true);
                    if (status.type) setStatus({ type: "", message: "" });
                  }}
                  onFocus={() => setIsOpen(true)}
                  style={styles.input}
                />

                {/* Dropdown Suggestions */}
                {isOpen && (
                  <ul style={styles.dropdownList}>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.slice(0, 30).map((st, idx) => (
                        <li
                          key={idx}
                          onClick={() => {
                            setSelectedStudent(st);
                            setSearchTerm(st.name);
                            setIsOpen(false);
                          }}
                          style={styles.dropdownItem}
                        >
                          <span style={{ fontWeight: "600" }}>{st.name}</span>
                          <span style={styles.groupSubTag}>{st.group}</span>
                        </li>
                      ))
                    ) : (
                      <li style={styles.noResultItem}>
                        ምንም አልተገኘም (No match found)
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Show Detected Group */}
            {selectedStudent && (
              <div style={styles.groupBadge}>
                📍 <strong>ቡድን:</strong> {selectedStudent.group}
              </div>
            )}

            {/* Attendance Choice */}
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

            {/* Permission Reason Field */}
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

            {/* Error / Success Messages Banner */}
            {status.message && (
              <p
                style={
                  status.type === "error"
                    ? styles.errorMsg
                    : styles.successMsg
                }
              >
                {status.message}
              </p>
            )}

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? "በመመዝገብ ላይ..." : "መረጃውን መዝግብ"}
            </button>
          </form>
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
    fontFamily:
      "'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    overflow: "hidden",
    backdropFilter: "blur(10px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  topImage: {
    width: "100%",
    height: "180px",
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
    margin: "0 0 20px 0",
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
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "#1f2430",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  dropdownList: {
    position: "absolute",
    top: "108%",
    left: 0,
    right: 0,
    maxHeight: "200px",
    overflowY: "auto",
    backgroundColor: "#191d26",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "10px",
    listStyle: "none",
    padding: "0",
    margin: "0",
    zIndex: 100,
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  },
  dropdownItem: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    fontSize: "14px",
    color: "#ffffff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupSubTag: {
    fontSize: "11px",
    color: "#a0a0a0",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  noResultItem: {
    padding: "12px 14px",
    fontSize: "13px",
    color: "#888888",
    textAlign: "center",
  },
  groupBadge: {
    backgroundColor: "rgba(217, 119, 6, 0.15)",
    border: "1px solid rgba(217, 119, 6, 0.4)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#fbbf24",
  },
  select: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "#1f2430",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
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
    padding: "8px",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: "6px",
  },
  successMsg: {
    fontSize: "13px",
    color: "#51cf66",
    margin: "0",
    padding: "8px",
    backgroundColor: "rgba(81, 207, 102, 0.1)",
    borderRadius: "6px",
  },
};