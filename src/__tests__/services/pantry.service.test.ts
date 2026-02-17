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
  getItems,
  getItem,
  addItem,
  updateItem,
  deleteItem,
  getExpiringItems,
  getItemsByCategory,
  deductQuantity,
} from "../../services/pantry.service";

const mockItem = {
  id: 1,
  userId: 1,
  name: "Milk",
  quantity: "1",
  unit: "L",
  category: "Dairy",
  expirationDate: "2025-06-01",
  usdaFdcId: null,
  barcode: null,
  notes: null,
  addedAt: new Date(),
  updatedAt: new Date(),
};

describe("pantry.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.keys(mockDb)) {
      mockDb[method].mockReturnValue(mockDb);
    }
  });

  describe("getItems", () => {
    it("returns all items for the user ordered by category and name", async () => {
      mockDb.orderBy.mockResolvedValueOnce([mockItem]);

      const result = await getItems(1);
      expect(result).toEqual([mockItem]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe("getItem", () => {
    it("returns an item matching id and userId", async () => {
      mockDb.where.mockResolvedValueOnce([mockItem]);

      const result = await getItem(1, 1);
      expect(result).toEqual(mockItem);
    });

    it("returns null when item not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await getItem(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("addItem", () => {
    it("inserts a new pantry item", async () => {
      mockDb.returning.mockResolvedValueOnce([mockItem]);

      const result = await addItem(1, {
        name: "Milk",
        quantity: "1",
        unit: "L",
        category: "Dairy",
      });
      expect(result).toEqual(mockItem);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("auto-marks default staples with isStaple: 1", async () => {
      const stapleItem = { ...mockItem, isStaple: 1, originalQuantity: "12" };
      mockDb.returning.mockResolvedValueOnce([stapleItem]);

      await addItem(1, { name: "eggs", quantity: "12" });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ isStaple: 1, originalQuantity: "12" })
      );
    });

    it("does not auto-mark non-staple names", async () => {
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, name: "saffron", isStaple: 0 }]);

      await addItem(1, { name: "saffron", quantity: "5" });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ isStaple: 0 })
      );
    });

    it("respects explicit isStaple override from user", async () => {
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, name: "saffron", isStaple: 1 }]);

      await addItem(1, { name: "saffron", quantity: "5", isStaple: 1 });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ isStaple: 1 })
      );
    });

    it("sets originalQuantity equal to provided quantity", async () => {
      mockDb.returning.mockResolvedValueOnce([mockItem]);

      await addItem(1, { name: "Chicken", quantity: "2" });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ originalQuantity: "2" })
      );
    });
  });

  describe("updateItem", () => {
    it("updates an existing item", async () => {
      mockDb.where.mockResolvedValueOnce([mockItem]);
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, name: "Whole Milk" }]);

      const result = await updateItem(1, 1, { name: "Whole Milk" });
      expect(result).toHaveProperty("name", "Whole Milk");
    });

    it("returns null when item not found (ownership check fails)", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await updateItem(999, 1, { name: "test" });
      expect(result).toBeNull();
    });

    it("updates originalQuantity when quantity increases (restock)", async () => {
      const existing = { ...mockItem, quantity: "5", originalQuantity: "10" };
      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.returning.mockResolvedValueOnce([{ ...existing, quantity: "15", originalQuantity: "15" }]);

      const result = await updateItem(1, 1, { quantity: "15" });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: "15", originalQuantity: "15" })
      );
      expect(result).toHaveProperty("quantity", "15");
    });

    it("does NOT update originalQuantity when quantity decreases", async () => {
      const existing = { ...mockItem, quantity: "10", originalQuantity: "10" };
      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.returning.mockResolvedValueOnce([{ ...existing, quantity: "5" }]);

      await updateItem(1, 1, { quantity: "5" });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.not.objectContaining({ originalQuantity: "5" })
      );
    });

    it("accepts and persists isStaple field", async () => {
      mockDb.where.mockResolvedValueOnce([mockItem]);
      mockDb.returning.mockResolvedValueOnce([{ ...mockItem, isStaple: 1 }]);

      const result = await updateItem(1, 1, { isStaple: 1 });

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ isStaple: 1 })
      );
      expect(result).toHaveProperty("isStaple", 1);
    });
  });

  describe("deleteItem", () => {
    it("deletes an item and returns it", async () => {
      mockDb.where.mockResolvedValueOnce([mockItem]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deleteItem(1, 1);
      expect(result).toEqual(mockItem);
    });

    it("returns null when item not found", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await deleteItem(999, 1);
      expect(result).toBeNull();
    });
  });

  describe("getExpiringItems", () => {
    it("returns items expiring within given days", async () => {
      mockDb.orderBy.mockResolvedValueOnce([mockItem]);

      const result = await getExpiringItems(1, 7);
      expect(result).toEqual([mockItem]);
    });
  });

  describe("getItemsByCategory", () => {
    it("groups items by category", async () => {
      const items = [
        { ...mockItem, id: 1, category: "Dairy", name: "Milk" },
        { ...mockItem, id: 2, category: "Dairy", name: "Cheese" },
        { ...mockItem, id: 3, category: "Produce", name: "Apple" },
      ];
      mockDb.orderBy.mockResolvedValueOnce(items);

      const result = await getItemsByCategory(1);
      expect(Object.keys(result)).toEqual(["Dairy", "Produce"]);
      expect(result["Dairy"]).toHaveLength(2);
      expect(result["Produce"]).toHaveLength(1);
    });

    it("uses 'Uncategorized' for items without a category", async () => {
      const items = [
        { ...mockItem, id: 1, category: null, name: "Mystery Item" },
      ];
      mockDb.orderBy.mockResolvedValueOnce(items);

      const result = await getItemsByCategory(1);
      expect(result).toHaveProperty("Uncategorized");
      expect(result["Uncategorized"]).toHaveLength(1);
    });

    it("returns empty object when no items", async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await getItemsByCategory(1);
      expect(result).toEqual({});
    });
  });

  describe("deductQuantity", () => {
    it("returns null when item not found (ownership check)", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await deductQuantity(999, 1, 5);
      expect(result).toBeNull();
    });

    it("deducts amount and returns old/new/original quantities", async () => {
      const item = { ...mockItem, id: 10, quantity: "10", originalQuantity: "10" };
      mockDb.where.mockResolvedValueOnce([item]);
      // update chain resolves
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deductQuantity(10, 1, 3);

      expect(result).toEqual({
        item,
        oldQuantity: 10,
        newQuantity: 7,
        originalQuantity: 10,
      });
    });

    it("clamps newQuantity to 0 (no negatives)", async () => {
      const item = { ...mockItem, id: 10, quantity: "2", originalQuantity: "10" };
      mockDb.where.mockResolvedValueOnce([item]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deductQuantity(10, 1, 5);

      expect(result!.newQuantity).toBe(0);
    });

    it("snapshots originalQuantity from current quantity on first deduction if not previously set", async () => {
      const item = { ...mockItem, id: 10, quantity: "8", originalQuantity: null };
      mockDb.where.mockResolvedValueOnce([item]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deductQuantity(10, 1, 3);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ originalQuantity: "8" })
      );
      expect(result!.originalQuantity).toBe(8);
    });

    it("uses existing originalQuantity if already set", async () => {
      const item = { ...mockItem, id: 10, quantity: "5", originalQuantity: "10" };
      mockDb.where.mockResolvedValueOnce([item]);
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await deductQuantity(10, 1, 2);

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.not.objectContaining({ originalQuantity: expect.any(String) })
      );
      expect(result!.originalQuantity).toBe(10);
    });
  });
});
