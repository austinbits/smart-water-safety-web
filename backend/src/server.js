require("dotenv").config({ quiet: true });
const { createPool } = require("./config/database");
const { createServer } = require("./app");
const pool = createPool();
createServer({ pool })
  .then(({ server, io }) => {
    const port = Number(process.env.PORT) || 5000;
    server.listen(port, () =>
      console.log(`Water Safety API: http://127.0.0.1:${port}`),
    );
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
  .catch(() => {
    console.error("Could not start Water Safety API. Check configuration.");
    process.exit(1);
  });
