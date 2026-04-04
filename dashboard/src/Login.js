import { useState } from "react";

const API = "http://localhost:3000"; // change to your Railway URL later

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ===== LOGIN =====
  const login = async () => {
    if (!email || !password) return alert("Enter all fields");

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
      } else {
        localStorage.setItem("token", data.token);

        // ✅ Go to dashboard
        window.location.href = "/";
      }
    } catch (err) {
      alert("Server error");
    }

    setLoading(false);
  };

  // ===== REGISTER =====
  const register = async () => {
    if (!email || !password) return alert("Enter all fields");

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
      } else {
        // ✅ AUTO LOGIN AFTER REGISTER
        const loginRes = await fetch(`${API}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const loginData = await loginRes.json();

        localStorage.setItem("token", loginData.token);

        // ✅ Redirect
        window.location.href = "/";
      }
    } catch (err) {
      alert("Server error");
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>🔥 AI Salon Login</h2>

        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button style={styles.loginBtn} onClick={login} disabled={loading}>
          {loading ? "Loading..." : "Login"}
        </button>

        <button style={styles.registerBtn} onClick={register} disabled={loading}>
          {loading ? "Loading..." : "Register"}
        </button>
      </div>
    </div>
  );
}

// ===== STYLES =====
const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #0f172a, #1e293b)"
  },
  card: {
    background: "#111827",
    padding: "30px",
    borderRadius: "12px",
    width: "300px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    textAlign: "center"
  },
  title: {
    color: "white",
    marginBottom: "20px"
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "12px",
    borderRadius: "8px",
    border: "none",
    outline: "none",
    background: "#1f2937",
    color: "white"
  },
  loginBtn: {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer"
  },
  registerBtn: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "none",
    background: "#10b981",
    color: "white",
    cursor: "pointer"
  }
};