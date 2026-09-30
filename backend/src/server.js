require("dotenv").config({ quiet: true });

const { createPool } = require("./config/database");
const { createServer } = require("./app");

// This small file is the process entry point. Application construction remains
// in app.js so it can be reused without opening a network port.
const pool = createPool();

createServer({ pool })
  .then(({ server, io }) => {
    const port = Number(process.env.PORT) || 5000;
    server.listen(port, () => console.log(`Map API: http://127.0.0.1:${port}`));
    // Close network and database resources cleanly during deploys or Ctrl+C.
    const close = () => {
      io.close();
      server.close(async () => {
        await pool?.end();
        process.exit(0);
      });
    };
    process.on("SIGTERM", close);
    process.on("SIGINT", close);
  })
  .catch((error) => {
    console.error("Could not start map API. Check configuration.");
    // Local development should expose the real startup fault. Production logs
    // retain only the concise message unless explicitly enabled.
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.LOG_STARTUP_ERRORS === "true"
    ) {
      console.error(error.stack || error.message);
    }
    process.exit(1);
  });
