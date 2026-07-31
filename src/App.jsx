import React, { useState } from "react";

export default function App() {
  const [fullName, setFullName] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("present");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (!fullName.trim()) {
      setMessage({ type: "error", text: "እባክዎ ሙሉ ስምዎን ያስገቡ።" });
      return;
    }

    if (status === "permission" && !reason.trim()) {
      setMessage({ type: "error", text: "እባክዎ የፈቃድ ምክንያትዎን ያስገቡ።" });
      return;
    }

    setLoading(true);

    // Get GPS coordinates if status is "present"
    if (status === "present") {
      if (!navigator.geolocation) {
        setMessage({
          type: "error",
          text: "ጂፒኤስ (GPS) በስልክዎ ላይ አይሰራም። እባክዎ በሌላ ስልክ ይሞክሩ።",
        });
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const payload = {
            fullName,
            group,
            status,
            reason: "",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          await sendSubmission(payload);
        },
        (error) => {
          setLoading(false);
          let errorMsg = "ቦታዎን ሳያረጋግጡ መመዝገብ አይችሉም።";
          if (error.code === error.PERMISSION_DENIED) {
            errorMsg = "እባክዎ በብราวዘርዎ/ስልክዎ ላይ የቦታ (Location) ፈቃድ ይስጡ።";
          }
          setMessage({ type: "error", text: errorMsg });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      // Permission request does not require GPS
      const payload = { fullName, group, status, reason };
      await sendSubmission(payload);
    }
  };

  const sendSubmission = async (payload) => {
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        setFullName("");
        setReason("");
      } else {
        setMessage({ type: "error", text: data.message || "ስህተት አጋጥሟል።" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "የኔትወርክ ስህተት አጋጥሟል። እባክዎ ደግመው ይሞክሩ።" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>🎼 የበገና ትምህርት ክፍል መገኘት መመዝገቢያ</h2>

        {message.text && (
          <div
            style={{
              ...styles.alert,
              backgroundColor: message.type === "error" ? "#fee2e2" : "#dcfce7",
              color: message.type === "error" ? "#991b1b" : "#166534",
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>ሙሉ ስም (Full Name)</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="ምሳሌ፡ አበበ ከበደ"
            style={styles.input}
            required
          />

          <label style={styles.label}>ቡድን (Group)</label>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            style={styles.input}
          >
            <option value="">-- ቡድን ይምረጡ --</option>
            <option value="ቡድን 1: ቤተ አውታር">ቡድን 1: ቤተ አውታር</option>
            <option value="ቡድን 2: ቤተ ማዕዶት">ቡድን 2: ቤተ ማዕዶት</option>
          </select>

          <label style={styles.label}>ሁኔታ (Status)</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={styles.input}
          >
            <option value="present">ተገኝቻለሁ (Present)</option>
            <option value="permission">ፈቃድ እጠይቃለሁ (Permission)</option>
          </select>

          {status === "permission" && (
            <>
              <label style={styles.label}>የፈቃድ ምክንያት (Reason)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="እባክዎ ምክንያትዎን እዚህ ይፃፉ..."
                style={{ ...styles.input, height: "80px" }}
                required
              />
            </>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "በማረጋገጥ ላይ..." : "መዝግብ (Submit)"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "16px",
    fontFamily: "sans-serif",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    maxWidth: "420px",
    width: "100%",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  title: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    textAlign: "center",
    color: "#1f2937",
    marginBottom: "20px",
  },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  label: { fontSize: "0.9rem", fontWeight: "600", color: "#374151" },
  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "1rem",
  },
  button: {
    padding: "12px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "8px",
  },
  alert: {
    padding: "10px",
    borderRadius: "6px",
    marginBottom: "12px",
    fontSize: "0.9rem",
    textAlign: "center",
  },
};