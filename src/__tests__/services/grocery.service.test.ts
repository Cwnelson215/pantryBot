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
  classifyIngredients,
  deduplicateItems,
  getOrCreateAutoReplenishList,
  createList,
  getLists,
  getList,
  getListItems,
  addItems,
  addCustomItem,
  toggleItem,
  removeItem,
  deleteList,
} from "../../services/grocery.service";

const mockList = {
  id: 1,
  userId: 1,
  name: "Test List",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockItem = {
  id: 1,
  listId: 1,
  name: "Chicken Breast",
  amount: "1",
  unit: "lb",
  category: null,
  checked: 0,
  sourceRecipeTitle: "Chicken Stir Fry",
  isCustom: 0,
  addedAt: new Date(),
};

describe("grocery.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  // ── classifyIngredients ──────────────────────────────────────────────

  describe("classifyIngredients", () => {
    it("marks exact match as matched", () => {
      const result = classifyIngredients(
        [{ name: "chicken" }],
        [{ name: "chicken" }]
      );
      expect(result.matched).toHaveLength(1);
      expect(result.partial).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });

    it("marks partial word match as partial", () => {
      const result = classifyIngredients(
        [{ name: "chicken breast" }],
        [{ name: "chicken" }]
      );
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].ingredient.name).toBe("chicken breast");
      expect(result.partial[0].pantryItemName).toBe("chicken");
      expect(result.matched).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });

    it("marks reverse partial match as partial", () => {
      const result = classifyIngredients(
        [{ name: "rice" }],
        [{ name: "jasmine rice" }]
      );
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].pantryItemName).toBe("jasmine rice");
    });

    it("does not false-positive on substring without word boundary", () => {
      const result = classifyIngredients(
        [{ name: "foil" }],
        [{ name: "oil" }]
      );
      expect(result.missing).toHaveLength(1);
      expect(result.partial).toHaveLength(0);
      expect(result.matched).toHaveLength(0);
    });

    it("handles case-insensitive exact match", () => {
      const result = classifyIngredients(
        [{ name: "olive oil" }],
        [{ name: "Olive Oil" }]
      );
      expect(result.matched).toHaveLength(1);
      expect(result.partial).toHaveLength(0);
    });

    it("marks completely unmatched as missing", () => {
      const result = classifyIngredients(
        [{ name: "saffron" }],
        [{ name: "chicken" }, { name: "rice" }]
      );
      expect(result.missing).toHaveLength(1);
      expect(result.matched).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it("treats all ingredients as missing when pantry is empty", () => {
      const result = classifyIngredients(
        [{ name: "chicken" }, { name: "rice" }],
        []
      );
      expect(result.missing).toHaveLength(2);
      expect(result.matched).toHaveLength(0);
      expect(result.partial).toHaveLength(0);
    });

    it("falls back to original when name is missing", () => {
      const result = classifyIngredients(
        [{ original: "2 cups flour" }],
        [{ name: "flour" }]
      );
      // "flour" is in "2 cups flour" as a word boundary match but not exact
      expect(result.partial).toHaveLength(1);
      expect(result.partial[0].pantryItemName).toBe("flour");
    });

    it("partial match includes pantry item name for display", () => {
      const result = classifyIngredients(
        [{ name: "chicken breast" }],
        [{ name: "chicken" }]
      );
      expect(result.partial[0].pantryItemName).toBe("chicken");
      expect(result.partial[0].ingredient.name).toBe("chicken breast");
    });
  });

  // ── deduplicateItems ─────────────────────────────────────────────────

  describe("deduplicateItems", () => {
    it("merges same ingredient from two recipes", () => {
      const result = deduplicateItems([
        { name: "chicken", sourceRecipeTitle: "Recipe A" },
        { name: "chicken", sourceRecipeTitle: "Recipe B" },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("chicken");
    });

    it("keeps different ingredients", () => {
      const result = deduplicateItems([
        { name: "chicken" },
        { name: "rice" },
      ]);
      expect(result).toHaveLength(2);
    });

    it("handles case-insensitive dedup", () => {
      const result = deduplicateItems([
        { name: "Chicken" },
        { name: "chicken" },
      ]);
      expect(result).toHaveLength(1);
    });
  });

  // ── getOrCreateAutoReplenishList ────────────────────────────────────

  describe("getOrCreateAutoReplenishList", () => {
    it("returns existing Auto-Replenish list when one exists", async () => {
      const autoList = { ...mockList, name: "Auto-Replenish" };
      mockDb.where.mockResolvedValueOnce([autoList]);

      const result = await getOrCreateAutoReplenishList(1);
      expect(result).toEqual(autoList);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("creates and returns a new Auto-Replenish list when none exists", async () => {
      const newList = { ...mockList, id: 5, name: "Auto-Replenish" };
      mockDb.where.mockResolvedValueOnce([]); // no existing list
      mockDb.returning.mockResolvedValueOnce([newList]);

      const result = await getOrCreateAutoReplenishList(1);
      expect(result).toEqual(newList);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ── CRUD operations ──────────────────────────────────────────────────

  describe("createList", () => {
    it("inserts and returns list", async () => {
      mockDb.returning.mockResolvedValueOnce([mockList]);

      const result = await createList(1, "Test List");
      expect(result).toEqual(mockList);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("getLists", () => {
    it("returns lists for user ordered by date desc", async () => {
      mockDb.orderBy.mockResolvedValueOnce([mockList]);

      const result = await getLists(1);
      expect(result).toEqual([mockList]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("getList", () => {
    it("returns list by id and userId", async () => {
      mockDb.where.mockResolvedValueOnce([mockList]);

      const result = await getList(1, 1);
      expect(result).toEqual(mockList);
    });

    it("returns null if not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await getList(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("getListItems", () => {
    it("returns items ordered by category and name", async () => {
      mockDb.orderBy.mockResolvedValueOnce([mockItem]);

      const result = await getListItems(1);
      expect(result).toEqual([mockItem]);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("addItems", () => {
    it("bulk inserts items", async () => {
      mockDb.returning.mockResolvedValueOnce([mockItem]);

      const result = await addItems(1, [
        { name: "Chicken Breast", amount: "1", unit: "lb" },
      ]);
      expect(result).toEqual([mockItem]);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("returns empty array for empty items", async () => {
      const result = await addItems(1, []);
      expect(result).toEqual([]);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe("addCustomItem", () => {
    it("inserts with isCustom=1", async () => {
      const customItem = { ...mockItem, isCustom: 1 };
      mockDb.returning.mockResolvedValueOnce([customItem]);

      const result = await addCustomItem(1, "Paper Towels");
      expect(result).toEqual(customItem);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("toggleItem", () => {
    it("toggles checked 0 to 1", async () => {
      mockDb.where.mockResolvedValueOnce([{ ...mockItem, checked: 0 }]);
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, checked: 1 }]);

      const result = await toggleItem(1, 1);
      expect(result).toHaveProperty("checked", 1);
    });

    it("toggles checked 1 to 0", async () => {
      mockDb.where.mockResolvedValueOnce([{ ...mockItem, checked: 1 }]);
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, checked: 0 }]);

      const result = await toggleItem(1, 1);
      expect(result).toHaveProperty("checked", 0);
    });

    it("returns null when item not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await toggleItem(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("removeItem", () => {
    it("deletes item by id and listId", async () => {
      mockDb.where.mockResolvedValueOnce([mockItem]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await removeItem(1, 1);
      expect(result).toEqual(mockItem);
    });

    it("returns null when item not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await removeItem(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("deleteList", () => {
    it("deletes list and returns it", async () => {
      mockDb.where.mockResolvedValueOnce([mockList]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deleteList(1, 1);
      expect(result).toEqual(mockList);
    });

    it("returns null if not owned", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await deleteList(999, 1);
      expect(result).toBeNull();
    });
  });
});
