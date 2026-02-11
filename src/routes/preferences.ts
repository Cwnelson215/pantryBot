import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import { db } from "../db/client";
import { userPreferences } from "../db/schema";
import { eq } from "drizzle-orm";

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Dairy-Free",
  "Keto",
  "Paleo",
  "Low-Carb",
  "Low-Fat",
  "Halal",
  "Kosher",
];

const ALLERGY_OPTIONS = [
  "Peanuts",
  "Tree Nuts",
  "Milk",
  "Eggs",
  "Wheat",
  "Soy",
  "Fish",
  "Shellfish",
  "Sesame",
];

const CUISINE_OPTIONS = [
  "American",
  "Chinese",
  "Indian",
  "Italian",
  "Japanese",
  "Korean",
  "Mediterranean",
  "Mexican",
  "Thai",
  "Vietnamese",
];

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const result = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  const preferences = result.length > 0 ? result[0] : null;

  res.render("pages/preferences", {
    title: "Preferences",
    preferences,
    dietaryOptions: DIETARY_OPTIONS,
    allergyOptions: ALLERGY_OPTIONS,
    cuisineOptions: CUISINE_OPTIONS,
  });
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;

  const {
    dietaryTags,
    allergies,
    cuisinePrefs,
    servingSize,
    calorieTarget,
    proteinTarget,
  } = req.body;

  const parsedDietaryTags = Array.isArray(dietaryTags)
    ? dietaryTags
    : dietaryTags
      ? dietaryTags.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

  const parsedAllergies = Array.isArray(allergies)
    ? allergies
    : allergies
      ? allergies.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

  const parsedCuisinePrefs = Array.isArray(cuisinePrefs)
    ? cuisinePrefs
    : cuisinePrefs
      ? cuisinePrefs.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

  const parsedServingSize = servingSize ? parseInt(servingSize) : null;
  const parsedCalorieTarget = calorieTarget ? parseInt(calorieTarget) : null;
  const parsedProteinTarget = proteinTarget ? parseInt(proteinTarget) : null;

  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set({
        dietaryTags: parsedDietaryTags,
        allergies: parsedAllergies,
        cuisinePrefs: parsedCuisinePrefs,
        servingSize: parsedServingSize,
        calorieTarget: parsedCalorieTarget,
        proteinTarget: parsedProteinTarget,
      })
      .where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({
      userId,
      dietaryTags: parsedDietaryTags,
      allergies: parsedAllergies,
      cuisinePrefs: parsedCuisinePrefs,
      servingSize: parsedServingSize,
      calorieTarget: parsedCalorieTarget,
      proteinTarget: parsedProteinTarget,
    });
  }

  setFlash(req, "success", "Preferences saved");
  res.redirect("/preferences");
});

export default router;
