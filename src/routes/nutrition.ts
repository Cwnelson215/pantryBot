import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import { db } from "../db/client";
import { userPreferences } from "../db/schema";
import { eq } from "drizzle-orm";
import * as nutritionService from "../services/nutrition.service";

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

  const date =
    (req.query.date as string) || new Date().toISOString().split("T")[0];

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
    recipeId,
    sourceData,
  } = req.body;

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
    recipeId: recipeId ? parseInt(recipeId) : undefined,
    sourceData: sourceData ? JSON.parse(sourceData) : undefined,
  });

  setFlash(req, "success", "Meal logged successfully");
  res.redirect(`/nutrition/daily?date=${logDate}`);
});

router.post("/log/:id/delete", async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);

  await nutritionService.deleteLog(id, userId);

  setFlash(req, "success", "Nutrition log entry deleted");

  const referrer = req.get("Referer") || "/nutrition/daily";
  res.redirect(referrer);
});

export default router;
