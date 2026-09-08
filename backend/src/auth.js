const { randomBytes } = require("node:crypto");
const sessions = new Map();
const cookieName = "sws_operator";
function readCookie(req) {
  return (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
}
function setCookie(res, token, clear = false) {
  const prod = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${token}; HttpOnly; Path=/api; SameSite=${prod ? "None" : "Lax"}; Max-Age=${clear ? 0 : 3600}${prod ? "; Secure" : ""}`,
  );
}
function installAuth(app, pool) {
  app.post("/api/auth/login", async (req, res) => {
    if (
      typeof req.body.email !== "string" ||
      typeof req.body.password !== "string" ||
      req.body.email.length > 254 ||
      req.body.password.length > 256
    )
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
      return res.status(503).json({
        error:
          "Operator authentication is not configured. Use the clearly labelled demo console.",
      });
    try {
      const response = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: req.body.email,
            password: req.body.password,
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      const result = await response.json();
      if (!response.ok)
        return res
          .status(401)
          .json({ error: "Sign-in failed. Check your credentials." });
      let role = result.user?.app_metadata?.role;
      if (pool) {
        const r = await pool.query(
          "SELECT role FROM sws_operator_roles WHERE user_id=$1",
          [result.user.id],
        );
        role = r.rows[0]?.role || role;
      }
      role = ["authority", "rescue_team"].includes(role) ? role : "tourist";
      if (req.body.role === "admin" && role === "tourist")
        return res
          .status(403)
          .json({ error: "This account does not have administrator access." });
      const token = randomBytes(32).toString("hex");
      sessions.set(token, {
        id: result.user.id,
        email: result.user.email,
        name: String(result.user.user_metadata?.name || "Visitor").slice(0, 80),
        age:
          Number.isInteger(result.user.user_metadata?.age) &&
          result.user.user_metadata.age > 0 &&
          result.user.user_metadata.age <= 120
            ? result.user.user_metadata.age
            : null,
        role,
        expires: Date.now() + Math.min(result.expires_in || 3600, 3600) * 1000,
      });
      setCookie(res, token);
      res.json({ token, user: sessions.get(token) });
    } catch {
      res
        .status(503)
        .json({ error: "Operator sign-in is currently unavailable." });
    }
  });
  app.get("/api/auth/me", (req, res) => {
    const s = getUser(req);
    if (!s || s.expires < Date.now())
      return res
        .status(401)
        .json({ error: "Sign in to access the operator console." });
    res.json({ user: s });
  });
  app.post("/api/auth/logout", (req, res) => {
    sessions.delete(
      req.headers.authorization?.replace(/^Bearer /, "") || readCookie(req),
    );
    setCookie(res, "", true);
    res.json({ signed_out: true });
  });
}
function requireOperator(req, res, next) {
  const s = getUser(req);
  if (!s || s.expires < Date.now())
    return res.status(401).json({ error: "Operator authentication required." });
  if (!["authority", "rescue_team"].includes(s.role))
    return res.status(403).json({ error: "Admin access required." });
  req.operator = s;
  next();
}
function getUser(req) {
  const token =
    req.headers.authorization?.replace(/^Bearer /, "") || readCookie(req);
  const s = sessions.get(token);
  return s && s.expires > Date.now() ? s : null;
}
module.exports = { installAuth, requireOperator, getUser };
