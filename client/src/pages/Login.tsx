import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">SC</span>
          SyncCollab
        </div>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="auth-sub">
          {mode === "login"
            ? "Log in to join your rooms."
            : "Start coding together in real time."}
        </p>
        <form onSubmit={handleSubmit}>
          <label className="field">
            Email
            <input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              placeholder="At least 8 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary full">
            {mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <p className="switch-line">
          {mode === "login" ? "No account? " : "Already have one? "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}