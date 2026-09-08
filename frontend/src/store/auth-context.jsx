/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";
export const AuthContext = createContext({
  user: { role: "admin", demo: true },
  admin: true,
});
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/workspace/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(form) {
    const d = await api(
      form.mode === "demo" ? "/workspace/demo" : "/auth/login",
      { method: "POST", body: JSON.stringify(form) },
    );
    sessionStorage.removeItem("sws-workspace");
    sessionStorage.removeItem("sws-auth");
    if (d.key) sessionStorage.setItem("sws-workspace", d.key);
    if (d.token) sessionStorage.setItem("sws-auth", d.token);
    setUser(d.user);
  }
  function logout() {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    sessionStorage.removeItem("sws-workspace");
    sessionStorage.removeItem("sws-auth");
    localStorage.removeItem("sws:workspace");
    setUser(null);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        admin: ["admin", "authority", "rescue_team"].includes(user?.role),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
