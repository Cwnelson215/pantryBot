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

vi.mock("../../services/pantry.service", () => ({
  getItems: vi.fn(),
  deductQuantity: vi.fn(),
}));

vi.mock("../../services/grocery.service", () => ({
  getOrCreateAutoReplenishList: vi.fn(),
  getListItems: vi.fn(),
  addItems: vi.fn(),
}));

vi.mock("../../services/unit-conversion.service", () => ({
  tryConvert: vi.fn(),
}));

import { previewCook, confirmCook } from "../../services/cooking.service";
import * as pantryService from "../../services/pantry.service";
import * as groceryService from "../../services/grocery.service";
import { tryConvert } from "../../services/unit-conversion.service";

const mockRecipe = {
  id: 1,
  userId: 1,
  title: "Pasta Carbonara",
  servings: 4,
  ingredientsJson: [
    { name: "pasta", amount: 400, unit: "g" },
    { name: "eggs", amount: 3, unit: "piece" },
    { name: "parmesan", amount: 100, unit: "g" },
  ],
};

const mockPantryItems = [
  {
    id: 10, userId: 1, name: "pasta", quantity: "500", unit: "g",
    category: "Grains", isStaple: 0, originalQuantity: "500",
  },
  {
    id: 11, userId: 1, name: "eggs", quantity: "12", unit: "piece",
    category: "Dairy", isStaple: 1, originalQuantity: "12",
  },
  {
    id: 12, userId: 1, name: "parmesan", quantity: "200", unit: "g",
    category: "Dairy", isStaple: 0, originalQuantity: "200",
  },
];

describe("cooking.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  // ── previewCook ─────────────────────────────────────────────────────

  describe("previewCook", () => {
    it("returns null when recipe not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await previewCook(1, 999);
      expect(result).toBeNull();
    });

    it("builds deductions for matching pantry ingredients", async () => {
      mockDb.where.mockResolvedValueOnce([mockRecipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);

      const result = await previewCook(1, 1);

      expect(result).not.toBeNull();
      expect(result!.deductions).toHaveLength(3);
      expect(result!.deductions[0]).toMatchObject({
        pantryItemId: 10,
        pantryItemName: "pasta",
        ingredientName: "pasta",
        amountDeducted: 400,
        unit: "g",
        oldQuantity: 500,
        newQuantity: 100,
      });
    });

    it("scales ingredient amounts when servings differ", async () => {
      mockDb.where.mockResolvedValueOnce([mockRecipe]); // servings: 4
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);

      const result = await previewCook(1, 1, 8); // request 8 servings (2x)

      expect(result).not.toBeNull();
      expect(result!.requestedServings).toBe(8);
      // Pasta: 400g * 2 = 800g deducted from 500g pantry
      expect(result!.deductions[0].amountDeducted).toBe(800);
      expect(result!.deductions[0].newQuantity).toBe(0); // clamped to 0
    });

    it("skips ingredients with no amount specified", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "salt" }], // no amount
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);

      const result = await previewCook(1, 1);

      expect(result!.deductions).toHaveLength(0);
      expect(result!.skipped).toHaveLength(1);
      expect(result!.skipped[0].reason).toContain("No amount specified");
    });

    it("skips ingredients not found in pantry", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "saffron", amount: 1, unit: "tsp" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);

      const result = await previewCook(1, 1);

      expect(result!.deductions).toHaveLength(0);
      expect(result!.skipped).toHaveLength(1);
      expect(result!.skipped[0].reason).toBe("Not found in pantry");
    });

    it("skips ingredients where pantry item has no quantity/unit", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 100, unit: "g" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 10, userId: 1, name: "pasta", quantity: null, unit: null, isStaple: 0 },
      ]);

      const result = await previewCook(1, 1);

      expect(result!.deductions).toHaveLength(0);
      expect(result!.skipped).toHaveLength(1);
      expect(result!.skipped[0].reason).toContain("no quantity/unit");
    });

    it("skips ingredients with incompatible units", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 1, unit: "cup" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);
      (tryConvert as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      const result = await previewCook(1, 1);

      expect(result!.deductions).toHaveLength(0);
      expect(result!.skipped).toHaveLength(1);
      expect(result!.skipped[0].reason).toContain("Incompatible units");
    });

    it("uses tryConvert for unit conversion when units differ", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 1, unit: "lb" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPantryItems);
      (tryConvert as ReturnType<typeof vi.fn>).mockReturnValueOnce(453.59);

      const result = await previewCook(1, 1);

      expect(tryConvert).toHaveBeenCalledWith(1, "lb", "g");
      expect(result!.deductions).toHaveLength(1);
      expect(result!.deductions[0].amountDeducted).toBeCloseTo(453.59, 1);
    });

    it("flags staple items that drop below 90% of originalQuantity", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "eggs", amount: 3, unit: "piece" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 11, userId: 1, name: "eggs", quantity: "12", unit: "piece",
          category: "Dairy", isStaple: 1, originalQuantity: "12",
        },
      ]);

      const result = await previewCook(1, 1);

      // 12 - 3 = 9, and 9 < 0.9 * 12 = 10.8 → should replenish
      expect(result!.replenishItems).toHaveLength(1);
      expect(result!.replenishItems[0]).toMatchObject({
        name: "eggs",
        currentQuantity: 9,
        originalQuantity: 12,
        unit: "piece",
      });
    });

    it("does NOT flag non-staple items for replenishment", async () => {
      const recipe = {
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 400, unit: "g" }],
      };
      mockDb.where.mockResolvedValueOnce([recipe]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 10, userId: 1, name: "pasta", quantity: "500", unit: "g",
          category: "Grains", isStaple: 0, originalQuantity: "500",
        },
      ]);

      const result = await previewCook(1, 1);

      // 500 - 400 = 100, which is < 90% of 500 (450), but isStaple is 0
      expect(result!.deductions).toHaveLength(1);
      expect(result!.replenishItems).toHaveLength(0);
    });
  });

  // ── confirmCook ─────────────────────────────────────────────────────

  describe("confirmCook", () => {
    it("returns null when recipe not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await confirmCook(1, 999);
      expect(result).toBeNull();
    });

    it("calls pantryService.deductQuantity for each deduction", async () => {
      mockDb.where.mockResolvedValueOnce([{
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 100, unit: "g" }],
      }]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 10, userId: 1, name: "pasta", quantity: "500", unit: "g",
          isStaple: 0, originalQuantity: "500",
        },
      ]);
      (pantryService.deductQuantity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        item: { id: 10, name: "pasta", unit: "g", isStaple: 0 },
        oldQuantity: 500,
        newQuantity: 400,
        originalQuantity: 500,
      });

      await confirmCook(1, 1);

      expect(pantryService.deductQuantity).toHaveBeenCalledWith(10, 1, 100);
    });

    it("re-checks replenish threshold using actual deduction results", async () => {
      mockDb.where.mockResolvedValueOnce([{
        ...mockRecipe,
        ingredientsJson: [{ name: "eggs", amount: 3, unit: "piece" }],
      }]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 11, userId: 1, name: "eggs", quantity: "12", unit: "piece",
          isStaple: 1, originalQuantity: "12",
        },
      ]);
      (pantryService.deductQuantity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        item: { id: 11, name: "eggs", unit: "piece", isStaple: 1 },
        oldQuantity: 12,
        newQuantity: 9,
        originalQuantity: 12,
      });
      (groceryService.getOrCreateAutoReplenishList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 50 });
      (groceryService.getListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (groceryService.addItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await confirmCook(1, 1);

      // 9 < 0.9 * 12 = 10.8 → should replenish
      expect(result!.replenishItems).toHaveLength(1);
      expect(result!.replenishItems[0].name).toBe("eggs");
    });

    it("creates auto-replenish grocery list via groceryService", async () => {
      mockDb.where.mockResolvedValueOnce([{
        ...mockRecipe,
        ingredientsJson: [{ name: "eggs", amount: 5, unit: "piece" }],
      }]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 11, userId: 1, name: "eggs", quantity: "12", unit: "piece",
          isStaple: 1, originalQuantity: "12",
        },
      ]);
      (pantryService.deductQuantity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        item: { id: 11, name: "eggs", unit: "piece", isStaple: 1 },
        oldQuantity: 12,
        newQuantity: 7,
        originalQuantity: 12,
      });
      (groceryService.getOrCreateAutoReplenishList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 50 });
      (groceryService.getListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (groceryService.addItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await confirmCook(1, 1);

      expect(groceryService.getOrCreateAutoReplenishList).toHaveBeenCalledWith(1);
      expect(groceryService.addItems).toHaveBeenCalledWith(50, [
        expect.objectContaining({ name: "eggs", amount: "12", unit: "piece" }),
      ]);
      expect(result!.autoReplenishListId).toBe(50);
    });

    it("skips duplicate items already on the auto-replenish list", async () => {
      mockDb.where.mockResolvedValueOnce([{
        ...mockRecipe,
        ingredientsJson: [{ name: "eggs", amount: 5, unit: "piece" }],
      }]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 11, userId: 1, name: "eggs", quantity: "12", unit: "piece",
          isStaple: 1, originalQuantity: "12",
        },
      ]);
      (pantryService.deductQuantity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        item: { id: 11, name: "eggs", unit: "piece", isStaple: 1 },
        oldQuantity: 12,
        newQuantity: 7,
        originalQuantity: 12,
      });
      (groceryService.getOrCreateAutoReplenishList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 50 });
      (groceryService.getListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 100, name: "Eggs", listId: 50 }, // already on list
      ]);

      const result = await confirmCook(1, 1);

      // addItems should not be called since all items are duplicates
      expect(groceryService.addItems).not.toHaveBeenCalled();
      expect(result!.autoReplenishListId).toBe(50);
    });

    it("returns autoReplenishListId as null when no replenishment needed", async () => {
      mockDb.where.mockResolvedValueOnce([{
        ...mockRecipe,
        ingredientsJson: [{ name: "pasta", amount: 10, unit: "g" }],
      }]);
      (pantryService.getItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 10, userId: 1, name: "pasta", quantity: "500", unit: "g",
          isStaple: 0, originalQuantity: "500",
        },
      ]);
      (pantryService.deductQuantity as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        item: { id: 10, name: "pasta", unit: "g", isStaple: 0 },
        oldQuantity: 500,
        newQuantity: 490,
        originalQuantity: 500,
      });

      const result = await confirmCook(1, 1);

      expect(result!.autoReplenishListId).toBeNull();
      expect(groceryService.getOrCreateAutoReplenishList).not.toHaveBeenCalled();
    });
  });
});
