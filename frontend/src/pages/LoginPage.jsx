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

/** Choose a visitor or operator workspace and establish its browser session. */
export default function LoginPage() {
  const { login } = useAuth();
  const [role, setRole] = useState("tourist");
  const [mode, setMode] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** Normalize form values before handing them to the authentication provider. */
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await login({ ...form, age: Number(form.age), role, mode });
    } catch (submitError) {
      setError(submitError.message);
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
          <span className="brand-word">Map workspace</span>
        </div>
        <div className="welcome-copy">
          <span className="eyebrow">THREE MAPPED LOCATIONS</span>
          <h1>
            Routes, conditions
            <br />
            <em>and emergency response.</em>
          </h1>
          <p>
            Explore paths, compare current modeled risk and rehearse a shared
            response workflow.
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
        <small>ROUTES · CONDITIONS · EMERGENCY RESPONSE</small>
      </section>
      <section className="welcome-form">
        <span className="eyebrow">OPEN A WORKSPACE</span>
        <h2>Choose a view</h2>
        <p>Use the visitor map or response console.</p>
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
