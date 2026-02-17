import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        dietary_tags JSON DEFAULT '[]',
        allergies JSON DEFAULT '[]',
        cuisine_prefs JSON DEFAULT '[]',
        serving_size INTEGER DEFAULT 2,
        calorie_target INTEGER,
        protein_target INTEGER
      );

      CREATE TABLE IF NOT EXISTS pantry_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        quantity DECIMAL(10, 2),
        unit VARCHAR(50),
        category VARCHAR(100),
        expiration_date DATE,
        usda_fdc_id VARCHAR(50),
        barcode VARCHAR(50),
        notes TEXT,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pantry_items_user_id_idx ON pantry_items(user_id);

      ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
      ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(10,2);
      ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS is_staple INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS saved_recipes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        spoonacular_id INTEGER,
        title VARCHAR(500) NOT NULL,
        source VARCHAR(50),
        ingredients_json JSON,
        instructions_json JSON,
        personalization TEXT,
        servings INTEGER,
        ready_in_minutes INTEGER,
        image_url TEXT,
        nutrition_json JSON,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS saved_recipes_user_id_idx ON saved_recipes(user_id);

      CREATE TABLE IF NOT EXISTS nutrition_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        log_date DATE NOT NULL,
        recipe_id INTEGER REFERENCES saved_recipes(id) ON DELETE SET NULL,
        food_name VARCHAR(255) NOT NULL,
        servings DECIMAL(5, 2) DEFAULT 1,
        calories DECIMAL(8, 2),
        protein_g DECIMAL(8, 2),
        carbs_g DECIMAL(8, 2),
        fat_g DECIMAL(8, 2),
        fiber_g DECIMAL(8, 2),
        sugar_g DECIMAL(8, 2),
        sodium_mg DECIMAL(8, 2),
        source_data JSON
      );
      CREATE INDEX IF NOT EXISTS nutrition_logs_user_date_idx ON nutrition_logs(user_id, log_date);

      -- New goal columns in user_preferences
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS fat_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS carbs_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS fiber_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS sugar_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS sodium_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS iron_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS calcium_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS vitamin_d_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS potassium_target INTEGER;
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS vitamin_c_target INTEGER;

      -- New nutrient columns in nutrition_logs
      ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS iron_mg DECIMAL(8,2);
      ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS calcium_mg DECIMAL(8,2);
      ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS vitamin_d_mcg DECIMAL(8,2);
      ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS potassium_mg DECIMAL(8,2);
      ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS vitamin_c_mg DECIMAL(8,2);

      -- Grocery lists
      CREATE TABLE IF NOT EXISTS grocery_lists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS grocery_lists_user_id_idx ON grocery_lists(user_id);

      -- Grocery list items
      CREATE TABLE IF NOT EXISTS grocery_list_items (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        amount VARCHAR(100),
        unit VARCHAR(50),
        category VARCHAR(100),
        checked INTEGER DEFAULT 0 NOT NULL,
        source_recipe_title VARCHAR(500),
        is_custom INTEGER DEFAULT 0 NOT NULL,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS grocery_list_items_list_id_idx ON grocery_list_items(list_id);
    `);
    console.log("Database tables initialized");
  } finally {
    client.release();
  }
}
