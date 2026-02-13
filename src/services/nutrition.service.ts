import { db } from "../db/client";
import { nutritionLogs } from "../db/schema";
import { eq, and, asc, sql, gte, lte } from "drizzle-orm";

export async function logMeal(
  userId: number,
  data: {
    logDate: string;
    foodName: string;
    servings?: string;
    calories?: string;
    proteinG?: string;
    carbsG?: string;
    fatG?: string;
    fiberG?: string;
    sugarG?: string;
    sodiumMg?: string;
    ironMg?: string;
    calciumMg?: string;
    vitaminDMcg?: string;
    potassiumMg?: string;
    vitaminCMg?: string;
    recipeId?: number;
    sourceData?: unknown;
  }
) {
  const result = await db
    .insert(nutritionLogs)
    .values({
      userId,
      logDate: data.logDate,
      foodName: data.foodName,
      servings: data.servings || undefined,
      calories: data.calories || null,
      proteinG: data.proteinG || null,
      carbsG: data.carbsG || null,
      fatG: data.fatG || null,
      fiberG: data.fiberG || null,
      sugarG: data.sugarG || null,
      sodiumMg: data.sodiumMg || null,
      ironMg: data.ironMg || null,
      calciumMg: data.calciumMg || null,
      vitaminDMcg: data.vitaminDMcg || null,
      potassiumMg: data.potassiumMg || null,
      vitaminCMg: data.vitaminCMg || null,
      recipeId: data.recipeId || null,
      sourceData: data.sourceData || null,
    })
    .returning();

  return result[0];
}

interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  ironMg: number;
  calciumMg: number;
  vitaminDMcg: number;
  potassiumMg: number;
  vitaminCMg: number;
}

export function computeTotals(
  entries: (typeof nutritionLogs.$inferSelect)[]
): DayTotals {
  const totals: DayTotals = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    ironMg: 0,
    calciumMg: 0,
    vitaminDMcg: 0,
    potassiumMg: 0,
    vitaminCMg: 0,
  };

  for (const entry of entries) {
    if (entry.calories) totals.calories += parseFloat(entry.calories);
    if (entry.proteinG) totals.proteinG += parseFloat(entry.proteinG);
    if (entry.carbsG) totals.carbsG += parseFloat(entry.carbsG);
    if (entry.fatG) totals.fatG += parseFloat(entry.fatG);
    if (entry.fiberG) totals.fiberG += parseFloat(entry.fiberG);
    if (entry.sugarG) totals.sugarG += parseFloat(entry.sugarG);
    if (entry.sodiumMg) totals.sodiumMg += parseFloat(entry.sodiumMg);
    if (entry.ironMg) totals.ironMg += parseFloat(entry.ironMg);
    if (entry.calciumMg) totals.calciumMg += parseFloat(entry.calciumMg);
    if (entry.vitaminDMcg) totals.vitaminDMcg += parseFloat(entry.vitaminDMcg);
    if (entry.potassiumMg) totals.potassiumMg += parseFloat(entry.potassiumMg);
    if (entry.vitaminCMg) totals.vitaminCMg += parseFloat(entry.vitaminCMg);
  }

  return totals;
}

export async function getDailyLog(userId: number, date: string) {
  const entries = await db
    .select()
    .from(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, userId),
        eq(nutritionLogs.logDate, date)
      )
    )
    .orderBy(asc(nutritionLogs.id));

  const totals = computeTotals(entries);

  return { entries, totals };
}

export async function getWeeklySummary(userId: number, startDate: string) {
  // Calculate end date (7 days from start)
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endDate = end.toISOString().split("T")[0];

  const entries = await db
    .select()
    .from(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, userId),
        gte(nutritionLogs.logDate, startDate),
        lte(nutritionLogs.logDate, endDate)
      )
    )
    .orderBy(asc(nutritionLogs.logDate), asc(nutritionLogs.id));

  // Group by date
  const grouped: Record<string, (typeof nutritionLogs.$inferSelect)[]> = {};

  for (const entry of entries) {
    const date = entry.logDate;
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(entry);
  }

  // Build summary for each day
  const summary = Object.entries(grouped).map(([date, dayEntries]) => ({
    date,
    totals: computeTotals(dayEntries),
    entryCount: dayEntries.length,
  }));

  // Sort by date
  summary.sort((a, b) => a.date.localeCompare(b.date));

  return summary;
}

export async function deleteLog(id: number, userId: number) {
  // Verify ownership
  const existing = await db
    .select()
    .from(nutritionLogs)
    .where(
      and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId))
    );

  if (existing.length === 0) {
    return null;
  }

  await db
    .delete(nutritionLogs)
    .where(
      and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId))
    );

  return existing[0];
}
