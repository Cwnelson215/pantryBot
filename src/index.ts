import app from "./app";
import { config } from "./config";
import { initializeDatabase } from "./db/client";

async function main() {
  try {
    await initializeDatabase();

    app.listen(config.port, () => {
      console.log(`pantry-bot listening on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

main();
