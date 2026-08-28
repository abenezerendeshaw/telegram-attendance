// src/App.jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";

// Base API URL for the PHP Backend
const API_BASE = "https://specificethiopian.com/evaluation/api";

// Get company slug from URL (?c=slug)
const urlParams = new URLSearchParams(window.location.search);
const companySlug = urlParams.get('c') || '';

const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes glowPulse { 0%, 100% { opacity: .5; } 50% { opacity: .9; } }
`;

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

  const primary = config?.primaryColor || "#d97706";

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
    const gpsDisabled = config?.disableGpsCheck || (!config?.classLat && !config?.classLng);
    if (attendanceStatus === "present" && !gpsDisabled) {
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

  // Drag-and-drop handlers
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

  const footerBar = (
    <footer style={styles.footer}>
      <span>
        Developed by{" "}
        <a href="https://specificethiopian.com" target="_blank" rel="noopener" style={{...styles.footerLink, color: primary}}>
          Specific Ethiopian
        </a>
      </span>
      <span style={styles.footerSep}>•</span>
      <span>
        Contact:{" "}
        <a href="https://t.me/xesser" target="_blank" rel="noopener" style={styles.footerLink}>
          @xesser
        </a>
      </span>
    </footer>
  );

  // ---------- Loading ----------
  if (isInitializing) {
    return (
      <div style={styles.app}>
        <style>{GLOBAL_CSS}</style>
        <div style={styles.glow1} />
        <div style={styles.glow2} />
        <div style={styles.loadingWrap}>
          <div style={{...styles.spinner, width: 32, height: 32, borderWidth: 3}} />
          <p style={styles.loadingText}>Loading…</p>
        </div>
      </div>
    );
  }

  // ---------- No org / invalid link: Sign in / Sign up ----------
  if (!companySlug || !config) {
    return (
      <div style={styles.app}>
        <style>{GLOBAL_CSS}</style>
        <div style={styles.glow1} />
        <div style={styles.glow2} />
        <div style={{...styles.card, textAlign: 'center'}}>
          <div style={{...styles.brandHeader, backgroundColor: '#d97706', backgroundImage: "linear-gradient(135deg, #d97706, #b45309)"}}>
            <div style={styles.brandMark}>📋</div>
          </div>
          <div style={styles.content}>
            <h1 style={styles.title}>Attendance Mini App</h1>
            <p style={styles.subtitle}>
              Sign in to your organization account, or register a new organization, to start using the attendance system.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <a href="https://specificethiopian.com/evaluation/login.php" style={{...styles.primaryBtn, textDecoration: 'none', backgroundColor: '#d97706', backgroundImage: "linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0))"}}>
                Sign In
              </a>
              <a href="https://specificethiopian.com/evaluation/register.php" style={{...styles.secondaryBtn, textDecoration: 'none'}}>
                Sign Up
              </a>
            </div>
          </div>
          {footerBar}
        </div>
      </div>
    );
  }

  const selectedView = mode === "attendance" && selectedStudent;

  return (
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      <div style={styles.card}>
        {selectedView ? (
          // ── Selected student: profile page using the default UI language ──
          <div style={{ animation: "fadeUp .3s ease", display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={styles.coverWrap}>
              {selectedStudent.image ? (
                <img src={selectedStudent.image} alt={selectedStudent.name} style={styles.coverImage} />
              ) : (
                <div style={{...styles.coverImage, backgroundColor: primary, backgroundImage: `linear-gradient(135deg, ${primary}, #0f1117)`}} />
              )}
              <div style={styles.coverOverlay} />
              <div style={styles.avatarBadge}>
                {selectedStudent.image ? (
                  <img src={selectedStudent.image} alt={selectedStudent.name} style={styles.avatarImage} />
                ) : (
                  <span style={styles.avatarFallback}>{(selectedStudent.name || "👤").charAt(0)}</span>
                )}
              </div>
            </div>

            <div style={{...styles.content, paddingTop: 48}}>
              <div style={styles.profileHead}>
                <h1 style={styles.title}>{selectedStudent.name}</h1>
                {selectedStudent.englishName && <p style={styles.subtitle}>{selectedStudent.englishName}</p>}
              </div>

              <div style={styles.badgeRow}>
                <div style={styles.badgeGroup}>📍 <strong>ቡድን:</strong> {selectedStudent.group}</div>
                {selectedStudent.branch && <div style={styles.badgeBranch}>🏢 <strong>ዘርፍ/ምድብ:</strong> {selectedStudent.branch}</div>}
                {selectedStudent.level && <div style={styles.badgeLevel}>🎓 <strong>ደረጃ:</strong> {selectedStudent.level}</div>}
              </div>

              <div style={styles.sectionDivider} />

              <div style={styles.field}>
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
                <div style={styles.field}>
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
                <p style={status.type === "error" ? styles.errorMsg : styles.successMsg}>{status.message}</p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                style={{...styles.primaryBtn, width: "100%", backgroundColor: primary, backgroundImage: "linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0))", opacity: loading ? 0.6 : 1}}
              >
                {loading ? (
                  <span style={styles.btnSpinnerWrap}><span style={styles.spinner} /></span>
                ) : null}
                {loading ? "በመመዝገብ ላይ..." : "መረጃውን መዝግብ"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent(null);
                  setSearchTerm("");
                  setStatus({ type: "", message: "" });
                }}
                style={{...styles.secondaryBtn, width: "100%", marginTop: 10}}
              >
                ← ስም ቀይር / Change Name
              </button>
            </div>
          </div>
        ) : (
          // ── Default: company cover + info + forms ──
          <>
            <div style={styles.coverWrap}>
              {config.cover ? (
                <img src={config.cover} alt="Cover" style={styles.coverImage} />
              ) : (
                <div style={{...styles.coverImage, backgroundColor: primary, backgroundImage: `linear-gradient(135deg, ${primary}, #0f1117)`}} />
              )}
              <div style={styles.coverOverlay} />
              {config.logo && <img src={config.logo} alt="Logo" style={styles.coverLogo} />}
            </div>

            <div style={styles.content}>
              <h1 style={styles.title}>{config.name}</h1>
              <p style={styles.subtitle}>{config.description || "ለዛሬው ክፍለ ጊዜ መገኘትዎን ወይም ፈቃድዎን እዚህ ያረጋግጡ።"}</p>

              <div style={styles.segmented}>
                <button
                  style={{...styles.segment, ...(mode === "attendance" ? {backgroundColor: primary, color: "#fff", borderColor: "transparent"} : {})}}
                  onClick={() => setMode("attendance")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.iconSmall}>
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                  Attendance
                </button>
                {config.receiptUploadEnabled && (
                  <button
                    style={{...styles.segment, ...(mode === "receipt" ? {backgroundColor: primary, color: "#fff", borderColor: "transparent"} : {})}}
                    onClick={() => setMode("receipt")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.iconSmall}>
                      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
                      <path d="M16 8h-6M16 12h-6" />
                    </svg>
                    Upload Receipt
                  </button>
                )}
              </div>

              {mode === "attendance" && (
                <form onSubmit={handleSubmit} style={styles.form}>
                  <div style={styles.field} ref={dropdownRef}>
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
                                {st.image ? (
                                  <img src={st.image} alt={st.name} style={styles.dropdownThumb} />
                                ) : (
                                  <span style={styles.dropdownThumb}>👤</span>
                                )}
                                <span style={styles.dropdownInfo}>
                                  <span style={{ fontWeight: "600" }}>{st.name}</span>
                                  <span style={styles.dropdownTags}>
                                    <span style={styles.groupSubTag}>{st.group}</span>
                                    {st.branch && <span style={styles.branchSubTag}>{st.branch}</span>}
                                    {st.level && <span style={styles.levelSubTag}>{st.level}</span>}
                                  </span>
                                </span>
                              </li>
                            ))
                          ) : (
                            <li style={styles.noResultItem}>ምንም አልተገኘም (No match found)</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div style={styles.field}>
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
                    <div style={styles.field}>
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
                    <p style={status.type === "error" ? styles.errorMsg : styles.successMsg}>{status.message}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    style={{...styles.primaryBtn, width: "100%", backgroundColor: primary, backgroundImage: "linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0))", opacity: loading ? 0.6 : 1}}
                  >
                    {loading ? (
                      <span style={styles.btnSpinnerWrap}><span style={styles.spinner} /></span>
                    ) : null}
                    {loading ? "በመመዝገብ ላይ..." : "መረጃውን መዝግብ"}
                  </button>
                </form>
              )}

              {mode === "receipt" && (
                <form onSubmit={handleReceiptSubmit} style={styles.form}>
                  <div style={styles.field}>
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

                  <div style={styles.field}>
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

                  <div style={styles.field}>
                    <label style={styles.label}>የደረሰኝ ምስል <span style={{ color: '#ff6b6b' }}>*</span></label>
                    <div
                      style={{
                        ...styles.uploadArea,
                        borderColor: receiptImageData ? primary : "rgba(255,255,255,0.12)",
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = primary;
                        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.style.borderColor = receiptImageData ? primary : "rgba(255,255,255,0.12)";
                        e.currentTarget.style.backgroundColor = "transparent";
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

                  {receiptStatusMsg.message && (
                    <p style={receiptStatusMsg.type === 'error' ? styles.errorMsg : styles.successMsg}>
                      {receiptStatusMsg.message}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="submit"
                      disabled={receiptLoading}
                      style={{
                        ...styles.primaryBtn,
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        backgroundColor: primary,
                        backgroundImage: "linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0))",
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
                      onClick={() => setMode('attendance')}
                      style={{ ...styles.secondaryBtn, flex: 0.5 }}
                    >
                      Back
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}

        {footerBar}
      </div>
    </div>
  );
}

// ---------- Styles ----------
const styles = {
  app: {
    minHeight: "100dvh",
    width: "100%",
    display: "flex",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#0a0c11",
    color: "#ffffff",
    fontFamily: "'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  glow1: {
    position: "fixed",
    top: "-160px",
    left: "-120px",
    width: "420px",
    height: "420px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(217,119,6,0.28), transparent 70%)",
    filter: "blur(40px)",
    animation: "glowPulse 6s ease-in-out infinite",
    pointerEvents: "none",
  },
  glow2: {
    position: "fixed",
    bottom: "-160px",
    right: "-120px",
    width: "420px",
    height: "420px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)",
    filter: "blur(40px)",
    animation: "glowPulse 8s ease-in-out infinite",
    pointerEvents: "none",
  },
  loadingWrap: {
    position: "relative",
    zIndex: 2,
    margin: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    color: "#fff",
  },
  loadingText: {
    fontSize: 14,
    color: "#9aa0ae",
    margin: 0,
  },
  card: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "rgba(20, 23, 31, 0.92)",
    borderLeft: "1px solid rgba(255, 255, 255, 0.09)",
    borderRight: "1px solid rgba(255, 255, 255, 0.09)",
    overflow: "hidden",
    backdropFilter: "blur(14px)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)",
    animation: "fadeUp .35s ease",
  },
  brandHeader: {
    height: "130px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: "18px",
    background: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 32,
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  },
  coverWrap: {
    position: "relative",
    height: "220px",
  },
  coverImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 20%",
  },
  coverOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(10,12,17,0.85) 100%)",
  },
  coverLogo: {
    position: "absolute",
    left: 16,
    bottom: 14,
    width: 48,
    height: 48,
    borderRadius: 12,
    border: "2px solid rgba(255,255,255,0.25)",
    objectFit: "cover",
    boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  },
  avatarBadge: {
    position: "absolute",
    left: "50%",
    bottom: -38,
    transform: "translateX(-50%)",
    width: 78,
    height: 78,
    borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.9)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
    overflow: "hidden",
    backgroundColor: "#1a1e28",
    zIndex: 3,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 30,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  profileHead: {
    marginBottom: 14,
  },
  sectionDivider: {
    height: 1,
    margin: "2px 0 18px",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
  },
  content: {
    padding: "22px 22px 8px",
    textAlign: "center",
  },
  title: {
    fontSize: "21px",
    fontWeight: "800",
    letterSpacing: "-0.01em",
    margin: "0 0 6px 0",
    color: "#f5f6fa",
  },
  subtitle: {
    fontSize: "13.5px",
    lineHeight: 1.5,
    color: "#9aa0ae",
    margin: "0 0 18px 0",
  },
  segmented: {
    display: "flex",
    gap: 6,
    padding: 5,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
  },
  segment: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 9,
    backgroundColor: "transparent",
    color: "#c3c8d2",
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    transition: "background-color .18s ease, color .18s ease",
  },
  iconSmall: {
    flexShrink: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    textAlign: "left",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#c3c8d2",
  },
  input: {
    width: "100%",
    padding: "13px 15px",
    borderRadius: "12px",
    backgroundColor: "#0e1116",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .18s ease, box-shadow .18s ease",
  },
  select: {
    width: "100%",
    padding: "13px 15px",
    borderRadius: "12px",
    backgroundColor: "#0e1116",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239aa0ae' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
  },
  textarea: {
    width: "100%",
    padding: "13px 15px",
    borderRadius: "12px",
    backgroundColor: "#0e1116",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color .18s ease, box-shadow .18s ease",
  },
  dropdownList: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    maxHeight: "230px",
    overflowY: "auto",
    backgroundColor: "#161a23",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    listStyle: "none",
    padding: "6px",
    margin: "0",
    zIndex: 100,
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
  },
  dropdownItem: {
    padding: "9px 10px",
    borderRadius: 9,
    cursor: "pointer",
    fontSize: "14px",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    transition: "background-color .12s ease",
  },
  dropdownThumb: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(255,255,255,0.15)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    fontSize: "16px",
  },
  dropdownInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  },
  dropdownTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  groupSubTag: {
    fontSize: "11px",
    color: "#a0a0a0",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: "2px 6px",
    borderRadius: "6px",
  },
  branchSubTag: {
    fontSize: "11px",
    color: "#93c5fd",
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    padding: "2px 6px",
    borderRadius: "6px",
  },
  levelSubTag: {
    fontSize: "11px",
    color: "#d8b4fe",
    backgroundColor: "rgba(168, 85, 247, 0.16)",
    padding: "2px 6px",
    borderRadius: "6px",
  },
  noResultItem: {
    padding: "14px",
    fontSize: "13px",
    color: "#888888",
    textAlign: "center",
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
  },
  badgeGroup: {
    backgroundColor: "rgba(217, 119, 6, 0.12)",
    border: "1px solid rgba(217, 119, 6, 0.3)",
    borderRadius: "10px",
    padding: "9px 13px",
    fontSize: "13px",
    color: "#fbbf24",
  },
  badgeBranch: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: "10px",
    padding: "9px 13px",
    fontSize: "13px",
    color: "#93c5fd",
  },
  badgeLevel: {
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    border: "1px solid rgba(168, 85, 247, 0.3)",
    borderRadius: "10px",
    padding: "9px 13px",
    fontSize: "13px",
    color: "#d8b4fe",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "14px",
    borderRadius: "12px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "700",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
    transition: "transform .12s ease, opacity .18s ease, box-shadow .18s ease",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "13px 16px",
    borderRadius: "12px",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#c3c8d2",
    fontSize: "14px",
    fontWeight: "600",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    transition: "background-color .18s ease",
  },
  btnSpinnerWrap: {
    display: "inline-flex",
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
  errorMsg: {
    fontSize: "13px",
    lineHeight: 1.4,
    color: "#ff7a7a",
    margin: "0",
    padding: "11px 13px",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    border: "1px solid rgba(255, 107, 107, 0.25)",
    borderRadius: "10px",
  },
  successMsg: {
    fontSize: "13px",
    lineHeight: 1.4,
    color: "#5fd47a",
    margin: "0",
    padding: "11px 13px",
    backgroundColor: "rgba(81, 207, 102, 0.1)",
    border: "1px solid rgba(81, 207, 102, 0.25)",
    borderRadius: "10px",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "14px 16px",
    marginTop: "auto",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    backgroundColor: "rgba(10,12,17,0.6)",
    fontSize: "12.5px",
    color: "#7c8290",
  },
  footerSep: {
    color: "#3a3f4a",
  },
  footerLink: {
    color: "#5aa7e6",
    textDecoration: "none",
    fontWeight: 600,
  },

  // ---------- Receipt Upload ----------
  uploadArea: {
    position: "relative",
    border: "2px dashed rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "22px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.2s, background-color 0.2s",
    minHeight: "150px",
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
    borderRadius: "10px",
    objectFit: "contain",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  previewHint: {
    fontSize: "12px",
    color: "#888888",
    margin: 0,
  },
};
