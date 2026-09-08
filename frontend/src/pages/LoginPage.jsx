import { useState } from "react";
import {
  Waves,
  ShieldCheck,
  Compass,
  ArrowUpRight,
  Mountain,
  Radio,
} from "lucide-react";
import { useAuth } from "../store/auth-context";
export default function LoginPage() {
  const { login } = useAuth();
  const [role, setRole] = useState("tourist"),
    [mode, setMode] = useState("demo"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await login({ ...f, age: Number(f.age), role, mode });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="welcome">
      <section className="welcome-story">
        <div className="brand">
          <span className="brand-mark">
            <Waves />
          </span>
          Smart Water
        </div>
        <div className="welcome-copy">
          <span className="eyebrow">AWARENESS STARTS HERE</span>
          <h1>
            Closer to nature.
            <br />
            <em>Connected to safety.</em>
          </h1>
          <p>
            Understand the water. Find your way. Stay connected to the people
            ready to help.
          </p>
          <div className="landscape-art">
            <i />
            <i />
            <i />
            <Waves size={90} />
          </div>
          <div className="welcome-sites">
            <span>
              <Waves />
              Calangute Beach
            </span>
            <span>
              <Radio />
              Muthathi River
            </span>
            <span>
              <Mountain />
              Dudhsagar Falls
            </span>
          </div>
        </div>
        <small>SMART INDIA HACKATHON 2026 · WATER SAFETY NETWORK</small>
      </section>
      <section className="welcome-form">
        <span className="eyebrow">YOUR JOURNEY, YOUR WORKSPACE</span>
        <h2>Welcome aboard.</h2>
        <p>Choose how you’re joining us today.</p>
        <div className="role-choice">
          {[
            ["tourist", "Tourist", Compass],
            ["admin", "Rescue admin", ShieldCheck],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={role === id ? "selected" : ""}
              onClick={() => setRole(id)}
            >
              <Icon />
              <strong>{label}</strong>
              <small>
                {id === "tourist"
                  ? "Explore, navigate and get help"
                  : "Coordinate, respond and monitor"}
              </small>
            </button>
          ))}
        </div>
        <div className="segmented">
          <button
            className={mode === "demo" ? "active" : ""}
            onClick={() => setMode("demo")}
          >
            Connected demo
          </button>
          <button
            className={mode === "account" ? "active" : ""}
            onClick={() => setMode("account")}
          >
            Account sign-in
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === "demo" ? (
            <>
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder={
                    role === "tourist" ? "Visitor name" : "Coordinator name"
                  }
                />
              </label>
              {role === "tourist" && (
                <label>
                  Age
                  <input
                    name="age"
                    type="number"
                    required
                    min="1"
                    max="120"
                    placeholder="Age"
                  />
                </label>
              )}
              <label>
                Shared drill code{" "}
                <small>Optional — leave blank to create a drill</small>
                <input
                  name="code"
                  placeholder="16-character invitation code"
                  maxLength={16}
                />
              </label>
              <p className="compact">
                Use the same code on the tourist and admin dashboards, even on
                different devices. Demo locations and requests are simulated.
              </p>
            </>
          ) : (
            <>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <p className="compact">
                Use your Supabase account. Admin permissions are checked by the
                server.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy
              ? "Connecting…"
              : `Enter ${role === "tourist" ? "tourist" : "rescue"} workspace`}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <small>
          Help requests reach this project’s rescue console. Official emergency
          dispatch is not connected. In an emergency, call 112.
        </small>
      </section>
    </div>
  );
}
