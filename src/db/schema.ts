import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  date,
  decimal,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Users ───────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  pantryItems: many(pantryItems),
  savedRecipes: many(savedRecipes),
  nutritionLogs: many(nutritionLogs),
  groceryLists: many(groceryLists),
}));

// ── User Preferences ────────────────────────────────────────────────────────────

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  dietaryTags: json("dietary_tags").$type<string[]>().default([]),
  allergies: json("allergies").$type<string[]>().default([]),
  cuisinePrefs: json("cuisine_prefs").$type<string[]>().default([]),
  servingSize: integer("serving_size").default(2),
  calorieTarget: integer("calorie_target"),
  proteinTarget: integer("protein_target"),
  fatTarget: integer("fat_target"),
  carbsTarget: integer("carbs_target"),
  fiberTarget: integer("fiber_target"),
  sugarTarget: integer("sugar_target"),
  sodiumTarget: integer("sodium_target"),
  ironTarget: integer("iron_target"),
  calciumTarget: integer("calcium_target"),
  vitaminDTarget: integer("vitamin_d_target"),
  potassiumTarget: integer("potassium_target"),
  vitaminCTarget: integer("vitamin_c_target"),
});

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  })
);

// ── Pantry Items ────────────────────────────────────────────────────────────────

export const pantryItems = pgTable(
  "pantry_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    quantity: decimal("quantity", { precision: 10, scale: 2 }),
    unit: varchar("unit", { length: 50 }),
    category: varchar("category", { length: 100 }),
    expirationDate: date("expiration_date"),
    usdaFdcId: varchar("usda_fdc_id", { length: 50 }),
    barcode: varchar("barcode", { length: 50 }),
    notes: text("notes"),
    originalQuantity: decimal("original_quantity", { precision: 10, scale: 2 }),
    isStaple: integer("is_staple").default(0),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("pantry_items_user_id_idx").on(table.userId),
  })
);

export const pantryItemsRelations = relations(pantryItems, ({ one }) => ({
  user: one(users, {
    fields: [pantryItems.userId],
    references: [users.id],
  }),
}));

// ── Saved Recipes ───────────────────────────────────────────────────────────────

export const savedRecipes = pgTable(
  "saved_recipes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    spoonacularId: integer("spoonacular_id"),
    title: varchar("title", { length: 500 }).notNull(),
    source: varchar("source", { length: 50 }),
    ingredientsJson: json("ingredients_json"),
    instructionsJson: json("instructions_json"),
    personalization: text("personalization"),
    servings: integer("servings"),
    readyInMinutes: integer("ready_in_minutes"),
    imageUrl: text("image_url"),
    nutritionJson: json("nutrition_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("saved_recipes_user_id_idx").on(table.userId),
  })
);

export const savedRecipesRelations = relations(savedRecipes, ({ one, many }) => ({
  user: one(users, {
    fields: [savedRecipes.userId],
    references: [users.id],
  }),
  nutritionLogs: many(nutritionLogs),
}));

// ── Nutrition Logs ──────────────────────────────────────────────────────────────

export const nutritionLogs = pgTable(
  "nutrition_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    recipeId: integer("recipe_id").references(() => savedRecipes.id, {
      onDelete: "set null",
    }),
    foodName: varchar("food_name", { length: 255 }).notNull(),
    servings: decimal("servings", { precision: 5, scale: 2 }).default("1"),
    calories: decimal("calories", { precision: 8, scale: 2 }),
    proteinG: decimal("protein_g", { precision: 8, scale: 2 }),
    carbsG: decimal("carbs_g", { precision: 8, scale: 2 }),
    fatG: decimal("fat_g", { precision: 8, scale: 2 }),
    fiberG: decimal("fiber_g", { precision: 8, scale: 2 }),
    sugarG: decimal("sugar_g", { precision: 8, scale: 2 }),
    sodiumMg: decimal("sodium_mg", { precision: 8, scale: 2 }),
    ironMg: decimal("iron_mg", { precision: 8, scale: 2 }),
    calciumMg: decimal("calcium_mg", { precision: 8, scale: 2 }),
    vitaminDMcg: decimal("vitamin_d_mcg", { precision: 8, scale: 2 }),
    potassiumMg: decimal("potassium_mg", { precision: 8, scale: 2 }),
    vitaminCMg: decimal("vitamin_c_mg", { precision: 8, scale: 2 }),
    sourceData: json("source_data"),
  },
  (table) => ({
    userDateIdx: index("nutrition_logs_user_date_idx").on(
      table.userId,
      table.logDate
    ),
  })
);

export const nutritionLogsRelations = relations(nutritionLogs, ({ one }) => ({
  user: one(users, {
    fields: [nutritionLogs.userId],
    references: [users.id],
  }),
  recipe: one(savedRecipes, {
    fields: [nutritionLogs.recipeId],
    references: [savedRecipes.id],
  }),
}));

// ── Grocery Lists ──────────────────────────────────────────────────────────────

export const groceryLists = pgTable(
  "grocery_lists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("grocery_lists_user_id_idx").on(table.userId),
  })
);

export const groceryListsRelations = relations(groceryLists, ({ one, many }) => ({
  user: one(users, {
    fields: [groceryLists.userId],
    references: [users.id],
  }),
  items: many(groceryListItems),
}));

// ── Grocery List Items ─────────────────────────────────────────────────────────

export const groceryListItems = pgTable(
  "grocery_list_items",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .notNull()
      .references(() => groceryLists.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    amount: varchar("amount", { length: 100 }),
    unit: varchar("unit", { length: 50 }),
    category: varchar("category", { length: 100 }),
    checked: integer("checked").default(0).notNull(),
    sourceRecipeTitle: varchar("source_recipe_title", { length: 500 }),
    isCustom: integer("is_custom").default(0).notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    listIdIdx: index("grocery_list_items_list_id_idx").on(table.listId),
  })
);

export const groceryListItemsRelations = relations(groceryListItems, ({ one }) => ({
  list: one(groceryLists, {
    fields: [groceryListItems.listId],
    references: [groceryLists.id],
  }),
}));
