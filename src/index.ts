import app from "./app";
import { config } from "./config";
import { initializeDatabase } from "./db/client";

async function main() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error("Database initialization failed:", err);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`pantry-bot listening on http://localhost:${config.port}`);
  });
}

main();
