import { spawn } from "node:child_process";

// Run both applications with one command and show their output in this terminal.
const children = [
  ["backend", ["src/server.js"]],
  [
    "frontend",
    ["node_modules/vite/bin/vite.js", "--port", "5173", "--strictPort"],
  ],
].map(([cwd, args]) =>
  spawn(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true }),
);
let closing = false;

/** Stop both child processes when either one exits or the user presses Ctrl+C. */
function close() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!closing) {
      close();
      process.exitCode = code || 0;
    }
  });
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
