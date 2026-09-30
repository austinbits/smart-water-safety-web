/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";

import { api } from "../services/api";

// The default value documents the shape consumed by components. The real value
// is supplied by AuthProvider before any signed-in page is rendered.
export const AuthContext = createContext({
  user: { role: "admin", demo: true },
  admin: true,
});

/** Read the current user and authentication actions from React context. */
export const useAuth = () => useContext(AuthContext);

/** Restore, create, and clear the current browser authentication session. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ask the server whether its secure cookie still represents a valid session.
  useEffect(() => {
    api("/workspace/me")
      .then((response) => setUser(response.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /** Sign in through either the isolated demo flow or a real operator account. */
  async function login(form) {
    const response = await api(
      form.mode === "demo" ? "/workspace/demo" : "/auth/login",
      { method: "POST", body: JSON.stringify(form) },
    );
    sessionStorage.removeItem("sws-workspace");
    sessionStorage.removeItem("sws-auth");
    if (response.key) sessionStorage.setItem("sws-workspace", response.key);
    if (response.token) sessionStorage.setItem("sws-auth", response.token);
    setUser(response.user);
  }

  /** Clear both server and browser session state. */
  function logout() {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    sessionStorage.removeItem("sws-workspace");
    sessionStorage.removeItem("sws-auth");
    localStorage.removeItem("sws:workspace");
    setUser(null);
  }

  const isAdministrator = ["admin", "authority", "rescue_team"].includes(
    user?.role,
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        admin: isAdministrator,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
