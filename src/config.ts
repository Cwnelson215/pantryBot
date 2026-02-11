import path from "path";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  nodeEnv: process.env.NODE_ENV || "development",

  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    name: process.env.DB_NAME || "pantry_bot",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
  },

  session: {
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  },

  spoonacular: {
    apiKey: process.env.SPOONACULAR_API_KEY || "",
    baseUrl: "https://api.spoonacular.com",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },

  usda: {
    apiKey: process.env.USDA_API_KEY || "",
    baseUrl: "https://api.nal.usda.gov/fdc/v1",
  },

  viewsPath: path.join(__dirname, "views"),
};
