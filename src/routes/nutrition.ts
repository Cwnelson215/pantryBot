import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import { db } from "../db/client";
import { userPreferences, savedRecipes } from "../db/schema";
import { eq } from "drizzle-orm";
import * as nutritionService from "../services/nutrition.service";
import * as usdaService from "../services/usda.service";

const router = Router();

router.use(requireAuth);

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const monday = getMondayOfWeek(new Date());

  const weeklySummary = await nutritionService.getWeeklySummary(userId, monday);

  const prefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  const preferences = prefs.length > 0 ? prefs[0] : null;

  res.render("pages/nutrition/index", {
    title: "Nutrition",
    weeklySummary,
    userPreferences: preferences,
  });
});

router.get("/daily", async (req, res) => {
  const userId = req.session.userId!;

  const dateParam = req.query.date as string;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const date =
    dateParam && dateRegex.test(dateParam)
      ? dateParam
      : new Date().toISOString().split("T")[0];

  const dailyLog = await nutritionService.getDailyLog(userId, date);

  const prefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  const preferences = prefs.length > 0 ? prefs[0] : null;

  res.render("pages/nutrition/daily", {
    title: "Daily Nutrition",
    entries: dailyLog.entries,
    totals: dailyLog.totals,
    date,
    userPreferences: preferences,
  });
});

router.post("/goals", async (req, res) => {
  const userId = req.session.userId!;

  const {
    calorieTarget,
    proteinTarget,
    fatTarget,
    carbsTarget,
    fiberTarget,
    sugarTarget,
    sodiumTarget,
    ironTarget,
    calciumTarget,
    vitaminDTarget,
    potassiumTarget,
    vitaminCTarget,
  } = req.body;

  const parseVal = (v: string) => (v ? parseInt(v) : null);

  const goalData = {
    calorieTarget: parseVal(calorieTarget),
    proteinTarget: parseVal(proteinTarget),
    fatTarget: parseVal(fatTarget),
    carbsTarget: parseVal(carbsTarget),
    fiberTarget: parseVal(fiberTarget),
    sugarTarget: parseVal(sugarTarget),
    sodiumTarget: parseVal(sodiumTarget),
    ironTarget: parseVal(ironTarget),
    calciumTarget: parseVal(calciumTarget),
    vitaminDTarget: parseVal(vitaminDTarget),
    potassiumTarget: parseVal(potassiumTarget),
    vitaminCTarget: parseVal(vitaminCTarget),
  };

  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set(goalData)
      .where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({
      userId,
      ...goalData,
    });
  }

  setFlash(req, "success", "Nutrition goals saved");
  res.redirect("/nutrition");
});

router.get("/api/usda-search", async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    return res.json([]);
  }

  try {
    const foods = await usdaService.searchFoods(q.trim(), 10);
    const results = (foods || []).map((food: any) => ({
      fdcId: food.fdcId,
      description: food.description,
      brandOwner: food.brandOwner || null,
      nutrients: usdaService.extractNutrientsFromSearchResult(food),
    }));
    res.json(results);
  } catch {
    res.status(500).json({ error: "Failed to search USDA database" });
  }
});

router.get("/api/saved-recipes", async (req, res) => {
  const userId = req.session.userId!;

  const recipes = await db
    .select({
      id: savedRecipes.id,
      title: savedRecipes.title,
      servings: savedRecipes.servings,
      nutritionJson: savedRecipes.nutritionJson,
    })
    .from(savedRecipes)
    .where(eq(savedRecipes.userId, userId));

  res.json(recipes);
});

router.post("/log", async (req, res) => {
  const userId = req.session.userId!;

  const {
    logDate,
    foodName,
    servings,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sugarG,
    sodiumMg,
    ironMg,
    calciumMg,
    vitaminDMcg,
    potassiumMg,
    vitaminCMg,
    recipeId,
    sourceData,
  } = req.body;

  let parsedSourceData: any;
  try {
    parsedSourceData = sourceData ? JSON.parse(sourceData) : undefined;
  } catch {
    setFlash(req, "error", "Invalid source data");
    return res.redirect("/nutrition/daily");
  }

  await nutritionService.logMeal(userId, {
    logDate,
    foodName,
    servings,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sugarG,
    sodiumMg,
    ironMg,
    calciumMg,
    vitaminDMcg,
    potassiumMg,
    vitaminCMg,
    recipeId: recipeId ? parseInt(recipeId) : undefined,
    sourceData: parsedSourceData,
  });

  setFlash(req, "success", "Meal logged successfully");
  res.redirect(`/nutrition/daily?date=${logDate}`);
});

router.post("/log/:id/delete", async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);

  await nutritionService.deleteLog(id, userId);

  setFlash(req, "success", "Nutrition log entry deleted");

  const referrer = req.get("Referer");
  const safeRedirect =
    referrer && referrer.startsWith("/") && !referrer.startsWith("//")
      ? referrer
      : "/nutrition/daily";
  res.redirect(safeRedirect);
});

export default router;
