import app from "./app";
import { config } from "./config";
import { initializeDatabase } from "./db/client";

async function main() {
  app.listen(config.port, () => {
    console.log(`pantry-bot listening on http://localhost:${config.port}`);
  });

  try {
    await initializeDatabase();
  } catch (err) {
    console.error("Database initialization failed:", err);
    process.exit(1);
  }
}

main();
