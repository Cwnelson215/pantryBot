import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const methods = [
    "select", "from", "where", "insert", "values", "returning",
    "update", "set", "delete", "orderBy", "limit", "offset", "groupBy",
  ] as const;
  const db: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of methods) db[m] = vi.fn();
  for (const m of methods) db[m].mockReturnValue(db);
  return { mockDb: db };
});

vi.mock("../../db/client", () => ({
  db: mockDb,
  pool: { connect: vi.fn(), end: vi.fn() },
}));

import {
  computeTotals,
  logMeal,
  getDailyLog,
  getWeeklySummary,
  deleteLog,
} from "../../services/nutrition.service";

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    logDate: "2025-01-15",
    recipeId: null,
    foodName: "Chicken Breast",
    servings: "1",
    calories: "250",
    proteinG: "30",
    carbsG: "0",
    fatG: "5",
    fiberG: "0",
    sugarG: "0",
    sodiumMg: "75",
    ironMg: "1",
    calciumMg: "10",
    vitaminDMcg: "0",
    potassiumMg: "300",
    vitaminCMg: "0",
    sourceData: null,
    ...overrides,
  };
}

describe("nutrition.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("computeTotals", () => {
    it("sums nutrient values across entries", () => {
      const entries = [
        makeEntry({ calories: "200", proteinG: "20", fatG: "10" }),
        makeEntry({ calories: "300", proteinG: "15", fatG: "8" }),
      ] as any[];

      const totals = computeTotals(entries);
      expect(totals.calories).toBe(500);
      expect(totals.proteinG).toBe(35);
      expect(totals.fatG).toBe(18);
    });

    it("handles null values safely", () => {
      const entries = [
        makeEntry({ calories: "100", proteinG: null, fatG: null }),
        makeEntry({ calories: "200", proteinG: "10", fatG: null }),
      ] as any[];

      const totals = computeTotals(entries);
      expect(totals.calories).toBe(300);
      expect(totals.proteinG).toBe(10);
      expect(totals.fatG).toBe(0);
    });

    it("returns zeros for empty array", () => {
      const totals = computeTotals([]);
      expect(totals.calories).toBe(0);
      expect(totals.proteinG).toBe(0);
      expect(totals.carbsG).toBe(0);
      expect(totals.fatG).toBe(0);
    });

    it("handles all nutrient fields", () => {
      const entries = [
        makeEntry({
          calories: "100",
          proteinG: "10",
          carbsG: "20",
          fatG: "5",
          fiberG: "3",
          sugarG: "2",
          sodiumMg: "100",
          ironMg: "1.5",
          calciumMg: "50",
          vitaminDMcg: "2",
          potassiumMg: "200",
          vitaminCMg: "10",
        }),
      ] as any[];

      const totals = computeTotals(entries);
      expect(totals.ironMg).toBe(1.5);
      expect(totals.calciumMg).toBe(50);
      expect(totals.vitaminDMcg).toBe(2);
      expect(totals.potassiumMg).toBe(200);
      expect(totals.vitaminCMg).toBe(10);
    });
  });

  describe("logMeal", () => {
    it("inserts a nutrition log entry", async () => {
      const logEntry = makeEntry();
      mockDb.returning.mockResolvedValueOnce([logEntry]);

      const result = await logMeal(1, {
        logDate: "2025-01-15",
        foodName: "Chicken Breast",
        calories: "250",
        proteinG: "30",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(logEntry);
    });
  });

  describe("getDailyLog", () => {
    it("returns entries and computed totals", async () => {
      const entries = [
        makeEntry({ id: 1, calories: "200" }),
        makeEntry({ id: 2, calories: "300" }),
      ];
      mockDb.orderBy.mockResolvedValueOnce(entries);

      const result = await getDailyLog(1, "2025-01-15");
      expect(result.entries).toHaveLength(2);
      expect(result.totals.calories).toBe(500);
    });
  });

  describe("getWeeklySummary", () => {
    it("groups entries by date and computes per-day totals", async () => {
      const entries = [
        makeEntry({ logDate: "2025-01-13", calories: "200" }),
        makeEntry({ logDate: "2025-01-13", calories: "300" }),
        makeEntry({ logDate: "2025-01-14", calories: "400" }),
      ];
      mockDb.orderBy.mockResolvedValueOnce(entries);

      const result = await getWeeklySummary(1, "2025-01-13");
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe("2025-01-13");
      expect(result[0].totals.calories).toBe(500);
      expect(result[0].entryCount).toBe(2);
      expect(result[1].date).toBe("2025-01-14");
      expect(result[1].totals.calories).toBe(400);
    });

    it("returns empty array when no entries", async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);
      const result = await getWeeklySummary(1, "2025-01-13");
      expect(result).toEqual([]);
    });
  });

  describe("deleteLog", () => {
    it("deletes an owned entry and returns it", async () => {
      const entry = makeEntry();
      mockDb.where.mockResolvedValueOnce([entry]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deleteLog(1, 1);
      expect(result).toEqual(entry);
    });

    it("returns null when entry not found or not owned", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await deleteLog(999, 1);
      expect(result).toBeNull();
    });
  });
});
