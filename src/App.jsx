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

    // Close the autocomplete dropdown when clicking outside
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);

    // Initialize Telegram WebApp viewport if running inside Telegram
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    return () => document.removeEventListener("pointerdown", handleClickOutside);
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

      // Reset Form State
      setSelectedStudent(null);
      setSearchTerm("");
      setReason("");
      setAttendanceStatus("present");

    } catch (err) {
      console.error("Detailed Submission Error:", err);

      let errorMessage = "ስህተት አጋጥሟል። እባክዎ ድጋሚ ይሞክሩ።";
      if (err.response) {
        errorMessage =
          err.response.data?.error ||
          err.response.data?.message ||
          `የሰርቨር ስህተት (${err.response.status})።`;
      } else if (err.request) {
        errorMessage = "የኢንተርኔት ወይም የሰርቨር ግንኙነት ችግር አለ።";
      }

      setStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const [mode, setMode] = useState("start");
  const [receiptFullName, setReceiptFullName] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptImageData, setReceiptImageData] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptStatusMsg, setReceiptStatusMsg] = useState({ type: "", message: "" });

  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return setReceiptImageData("");
    const reader = new FileReader();
    reader.onload = () => setReceiptImageData(reader.result);
    reader.readAsDataURL(f);
  };

  const handleReceiptSubmit = async (e) => {
    e.preventDefault();
    if (!receiptFullName.trim() || !receiptNumber.trim() || !receiptImageData) {
      setReceiptStatusMsg({ type: "error", message: "ሙሉ ስም፣ ቁጥር እና ምስል አስፈላጊ ናቸው።" });
      return;
    }
    setReceiptLoading(true);
    setReceiptStatusMsg({ type: "", message: "" });
    try {
      await axios.post("/api/receipt", {
        fullName: receiptFullName,
        receiptNumber: receiptNumber,
        imageData: receiptImageData,
      });
      setReceiptStatusMsg({ type: "success", message: "Receipt submitted successfully." });
      setReceiptFullName("");
      setReceiptNumber("");
      setReceiptImageData("");
    } catch (err) {
      console.error(err);
      setReceiptStatusMsg({ type: "error", message: err.response?.data?.message || "Submission failed" });
    } finally {
      setReceiptLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/begena.png" alt="በገና (Begena)" style={styles.topImage} />

        <div style={styles.content}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <svg style={styles.iconLarge} viewBox="0 0 20 20">
              <use href="/icons.svg#social-icon" />
            </svg>
            <h1 style={styles.title}>የበገና ትምህርት መገኘት መዝግብ</h1>
          </div>
          <p style={styles.subtitle}>ለዛሬ እባክዎ የመጀመሪያውን እርምጃ ይምረጡ።</p>

          <div style={styles.choiceRow}>
            <button
              style={{ ...styles.choiceButton, ...(mode === "attendance" ? styles.choiceActive : {}) }}
              onClick={() => setMode("attendance")}
            >
              <svg style={styles.iconSmall} viewBox="0 0 19 19"><use href="/icons.svg#github-icon" /></svg>
              Attendance
            </button>
            <button
              style={{ ...styles.choiceButton, ...(mode === "receipt" ? styles.choiceActive : {}) }}
              onClick={() => setMode("receipt")}
            >
              <svg style={styles.iconSmall} viewBox="0 0 16 17"><use href="/icons.svg#bluesky-icon" /></svg>
              Upload Receipt
            </button>
          </div>

          {mode === "attendance" && (
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
                    const val = e.target.value;
                    setSearchTerm(val);
                    // Only clear selection if user is editing away from the selected name
                    if (selectedStudent && val !== selectedStudent.name) {
                      setSelectedStudent(null);
                    }
                    setIsOpen(true);
                    if (status.type) setStatus({ type: "", message: "" });
                  }}
                  onFocus={() => setIsOpen(true)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  style={styles.input}
                />

                {/* Dropdown Suggestions */}
                {isOpen && (
                  <ul style={styles.dropdownList}>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.slice(0, 30).map((st, idx) => (
                        <li
                          key={idx}
                          onPointerDown={(e) => {
                            e.preventDefault(); // prevent input blur before selection
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
          )}

          {mode === "receipt" && (
            <form onSubmit={handleReceiptSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name</label>
                <input
                  value={receiptFullName}
                  onChange={(e) => setReceiptFullName(e.target.value)}
                  style={styles.input}
                  placeholder="Full name"
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Receipt Number</label>
                <input
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  style={styles.input}
                  placeholder="Receipt #"
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Screenshot</label>
                <input type="file" accept="image/*" onChange={handleFileChange} style={styles.input} />
                {receiptImageData && (
                  <img src={receiptImageData} alt="preview" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />
                )}
              </div>

              {receiptStatusMsg.message && (
                <p style={receiptStatusMsg.type === 'error' ? styles.errorMsg : styles.successMsg}>{receiptStatusMsg.message}</p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={receiptLoading} style={styles.button}>
                  {receiptLoading ? 'Sending...' : 'Submit Receipt'}
                </button>
                <button type="button" onClick={() => setMode('start')} style={{ ...styles.button, backgroundColor: '#334155' }}>
                  Back
                </button>
              </div>
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
  choiceRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 14,
  },
  choiceButton: {
    padding: '10px 14px',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    fontWeight: 600,
  },
  choiceActive: {
    backgroundColor: '#d97706',
    borderColor: 'transparent',
  },
  iconLarge: {
    width: 44,
    height: 44,
    display: 'block',
    fill: '#d97706',
  },
  iconSmall: {
    width: 16,
    height: 16,
    marginRight: 8,
    verticalAlign: 'middle',
    fill: '#ffffff',
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