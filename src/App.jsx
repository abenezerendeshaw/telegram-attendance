// src/App.jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";

// Base API URL for the PHP Backend
const API_BASE = "https://specificethiopian.com/evaluation/api";

// Get company slug from URL (?c=slug)
const urlParams = new URLSearchParams(window.location.search);
const companySlug = urlParams.get('c') || '';

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  
  // Multi-tenant state
  const [studentsList, setStudentsList] = useState([]);
  const [config, setConfig] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 24-hour Lock State
  const [isLocked, setIsLocked] = useState(false);
  const [hoursLeft, setHoursLeft] = useState(0);

  const dropdownRef = useRef(null);

  // Admin mode — skip all locks when #admin is in the URL hash OR ?admin=1 in query
  // Note: Telegram Web Apps strip query params but preserve the hash fragment
  const isAdminMode =
    window.location.hash.includes("admin") ||
    new URLSearchParams(window.location.search).get("admin") === "1";

  useEffect(() => {
    const checkLockStatus = () => {
      // Skip localStorage lock entirely in admin mode
      if (isAdminMode) return;

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

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);

    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
    }

    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  // Fetch configuration and members
  useEffect(() => {
    if (!companySlug) {
      setIsInitializing(false);
      return;
    }

    const loadData = async () => {
      try {
        const [confRes, memRes] = await Promise.all([
          axios.get(`${API_BASE}/config.php?c=${companySlug}`),
          axios.get(`${API_BASE}/members.php?c=${companySlug}`)
        ]);
        setConfig(confRes.data);
        setStudentsList(memRes.data.members || []);
      } catch (e) {
        console.error("Failed to load company data:", e);
      } finally {
        setIsInitializing(false);
      }
    };
    loadData();
  }, []);

  const filteredStudents = studentsList.filter((s) => {
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
      await axios.post(`${API_BASE}/submit.php?c=${companySlug}`, {
        fullName: selectedStudent.name,
        group: selectedStudent.group,
        status: attendanceStatus,
        reason: attendanceStatus === "permission" ? reason : "",
        ...(isAdminMode && { adminOverride: true }),
        ...coords,
      });

      const nowTimestamp = Date.now();
      // Only set the lock in normal (non-admin) mode
      if (!isAdminMode) {
        localStorage.setItem("last_attendance_timestamp", nowTimestamp.toString());
        setIsLocked(true);
        setHoursLeft(24);
      }

      setStatus({ type: "success", message: "✅ መረጃዎ በተሳካ ሁኔታ ተመዝግቧል!" });

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

  const [mode, setMode] = useState("attendance");
  const [receiptPayerName, setReceiptPayerName] = useState("");
  const [receiptStudentName, setReceiptStudentName] = useState("");
  const [receiptImageData, setReceiptImageData] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptStatusMsg, setReceiptStatusMsg] = useState({ type: "", message: "" });

  // ---------- Improved Receipt Handlers ----------
  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setReceiptImageData("");
      return;
    }
    // Optional: file size validation (e.g., max 5MB)
    if (f.size > 5 * 1024 * 1024) {
      setReceiptStatusMsg({ type: "error", message: "Image size must be less than 5MB." });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceiptImageData(reader.result);
    reader.readAsDataURL(f);
  };

  // Drag‑and‑drop handlers
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      if (f.size > 5 * 1024 * 1024) {
        setReceiptStatusMsg({ type: "error", message: "Image size must be less than 5MB." });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setReceiptImageData(reader.result);
      reader.readAsDataURL(f);
      // Sync the file input for consistency (optional)
      const input = document.getElementById("receiptFileInput");
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
      }
    }
  };

  const handleReceiptSubmit = async (e) => {
    e.preventDefault();
    // Validation
    if (!receiptPayerName.trim() || !receiptStudentName.trim() || !receiptImageData) {
      setReceiptStatusMsg({ type: "error", message: "ሁሉም መስኮች አስፈላጊ ናቸው።" });
      return;
    }
    setReceiptLoading(true);
    setReceiptStatusMsg({ type: "", message: "" });
    try {
      await axios.post(`${API_BASE}/receipt.php?c=${companySlug}`, {
        payerName: receiptPayerName,
        studentName: receiptStudentName,
        imageData: receiptImageData,
      });
      setReceiptStatusMsg({ type: "success", message: "✅ ደረሰኙ በተሳካ ሁኔታ ተልኳል።" });
      setReceiptPayerName("");
      setReceiptStudentName("");
      setReceiptImageData("");
      // Reset file input
      const input = document.getElementById("receiptFileInput");
      if (input) input.value = "";
    } catch (err) {
      console.error(err);
      setReceiptStatusMsg({ type: "error", message: err.response?.data?.message || "Submission failed" });
    } finally {
      setReceiptLoading(false);
    }
  };

  if (isInitializing) {
    return <div style={{...styles.container, color: '#fff'}}>Loading...</div>;
  }

  if (!companySlug || !config) {
    return (
      <div style={styles.container}>
        <div style={{...styles.card, padding: 30, textAlign: 'center'}}>
          <h2>Invalid Link</h2>
          <p>This attendance link is incomplete or the organization was not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {config.cover ? (
          <img src={config.cover} alt="Cover" style={styles.topImage} />
        ) : (
          <div style={{...styles.topImage, backgroundColor: config.primaryColor || '#d97706'}}></div>
        )}

        <div style={styles.content}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {config.logo && <img src={config.logo} alt="Logo" style={{width:40, height:40, borderRadius:8}} />}
            <h1 style={styles.title}>{config.name}</h1>
          </div>
          <p style={styles.subtitle}>{config.description || "ለዛሬው ክፍለ ጊዜ መገኘትዎን ወይም ፈቃድዎን እዚህ ያረጋግጡ።"}</p>

          <div style={styles.choiceRow}>
            <button
              style={{ ...styles.choiceButton, ...(mode === "attendance" ? {backgroundColor: config.primaryColor || '#d97706', borderColor: 'transparent'} : {}) }}
              onClick={() => setMode("attendance")}
            >
              <svg style={styles.iconSmall} viewBox="0 0 19 19"><use href="/icons.svg#github-icon" /></svg>
              Attendance
            </button>
            {config.receiptUploadEnabled && (
              <button
                style={{ ...styles.choiceButton, ...(mode === "receipt" ? {backgroundColor: config.primaryColor || '#d97706', borderColor: 'transparent'} : {}) }}
                onClick={() => setMode("receipt")}
              >
                <svg style={styles.iconSmall} viewBox="0 0 16 17"><use href="/icons.svg#bluesky-icon" /></svg>
                Upload Receipt
              </button>
            )}
          </div>

          {mode === "attendance" && (
            <form onSubmit={handleSubmit} style={styles.form}>
              {/* ... attendance form (unchanged) ... */}
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
                  {isOpen && (
                    <ul style={styles.dropdownList}>
                      {filteredStudents.length > 0 ? (
                        filteredStudents.slice(0, 30).map((st, idx) => (
                          <li
                            key={idx}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              setSelectedStudent(st);
                              setSearchTerm(st.name);
                              setIsOpen(false);
                            }}
                            style={styles.dropdownItem}
                          >
                            <span style={{ fontWeight: "600" }}>{st.name}</span>
                            <span style={styles.groupSubTag}>{st.group}</span>
                            {st.branch && <span style={styles.branchSubTag}>{st.branch}</span>}
                            {st.level && <span style={styles.levelSubTag}>{st.level}</span>}
                          </li>
                        ))
                      ) : (
                        <li style={styles.noResultItem}>ምንም አልተገኘም (No match found)</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>

              {selectedStudent && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                  <div style={styles.groupBadge}>📍 <strong>ቡድን:</strong> {selectedStudent.group}</div>
                  {selectedStudent.branch && <div style={styles.branchBadge}>🏢 <strong>ቅርንጫፍ:</strong> {selectedStudent.branch}</div>}
                  {selectedStudent.level && <div style={styles.levelBadge}>🎓 <strong>ደረጃ:</strong> {selectedStudent.level}</div>}
                </div>
              )}

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

              <button type="submit" disabled={loading} style={{...styles.button, backgroundColor: config.primaryColor || '#d97706'}}>
                {loading ? "በመመዝገብ ላይ..." : "መረጃውን መዝግብ"}
              </button>
            </form>
          )}

          {mode === "receipt" && (
            <form onSubmit={handleReceiptSubmit} style={styles.form}>
              {/* Payer Name */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>ክፍያውን የፈጸመው ስም <span style={{ color: '#ff6b6b' }}>*</span></label>
                <input
                  value={receiptPayerName}
                  onChange={(e) => {
                    setReceiptPayerName(e.target.value);
                    if (receiptStatusMsg.type) setReceiptStatusMsg({ type: "", message: "" });
                  }}
                  style={styles.input}
                  placeholder="ክፍያ የፈጸመውን ሰው ስም ያስገቡ"
                  required
                />
              </div>

              {/* Student Name */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>የተከፈለለት ተማሪ ስም <span style={{ color: '#ff6b6b' }}>*</span></label>
                <input
                  value={receiptStudentName}
                  onChange={(e) => {
                    setReceiptStudentName(e.target.value);
                    if (receiptStatusMsg.type) setReceiptStatusMsg({ type: "", message: "" });
                  }}
                  style={styles.input}
                  placeholder="ክፍያ የተፈጸመለትን ተማሪ ስም ያስገቡ"
                  required
                />
              </div>

              {/* Image Upload - Professional Drop Zone */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>የደረሰኝ ምስል <span style={{ color: '#ff6b6b' }}>*</span></label>
                <div
                  style={{
                    ...styles.uploadArea,
                    borderColor: receiptImageData ? '#d97706' : 'rgba(255,255,255,0.2)',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#d97706';
                    e.currentTarget.style.backgroundColor = 'rgba(217,119,6,0.08)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = receiptImageData ? '#d97706' : 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onDrop={handleDrop}
                >
                  <input
                    id="receiptFileInput"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={styles.fileInput}
                  />
                  {receiptImageData ? (
                    <div style={styles.previewContainer}>
                      <img src={receiptImageData} alt="Receipt preview" style={styles.previewImage} />
                      <p style={styles.previewHint}>Click or drag to replace</p>
                    </div>
                  ) : (
                    <div style={styles.uploadPlaceholder}>
                      <span style={styles.uploadIcon}>📄</span>
                      <p style={styles.uploadText}>Drop your receipt image here</p>
                      <p style={styles.uploadHint}>or click to browse (JPG, PNG, WebP, max 5MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status message */}
              {receiptStatusMsg.message && (
                <p style={receiptStatusMsg.type === 'error' ? styles.errorMsg : styles.successMsg}>
                  {receiptStatusMsg.message}
                </p>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  disabled={receiptLoading}
                  style={{
                    ...styles.button,
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {receiptLoading ? (
                    <>
                      <span style={styles.spinner}></span>
                      በመላክ ላይ...
                    </>
                  ) : (
                    'ደረሰኙን ላክ'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('start')}
                  style={{ ...styles.button, backgroundColor: '#334155', flex: 0.5 }}
                >
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

// ---------- Enhanced Styles ----------
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
  iconSmall: {
    width: 16,
    height: 16,
    marginRight: 8,
    verticalAlign: 'middle',
    fill: 'var(--icon-color)',
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
  branchSubTag: {
    fontSize: "11px",
    color: "#93c5fd",
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  levelSubTag: {
    fontSize: "11px",
    color: "#d8b4fe",
    backgroundColor: "rgba(168, 85, 247, 0.15)",
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
  branchBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.4)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#93c5fd",
  },
  levelBadge: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    border: "1px solid rgba(168, 85, 247, 0.4)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#d8b4fe",
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
    transition: "opacity 0.2s",
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

  // ---------- New Receipt Upload Styles ----------
  uploadArea: {
    position: "relative",
    border: "2px dashed rgba(255,255,255,0.2)",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.2s, background-color 0.2s",
    minHeight: "140px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  fileInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    cursor: "pointer",
    width: "100%",
    height: "100%",
  },
  uploadPlaceholder: {
    pointerEvents: "none",
  },
  uploadIcon: {
    fontSize: "36px",
    display: "block",
    marginBottom: "8px",
  },
  uploadText: {
    fontSize: "14px",
    color: "#cccccc",
    margin: "4px 0",
  },
  uploadHint: {
    fontSize: "12px",
    color: "#888888",
  },
  previewContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    width: "100%",
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: "180px",
    borderRadius: "8px",
    objectFit: "contain",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  previewHint: {
    fontSize: "12px",
    color: "#888888",
    margin: 0,
  },
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};

