import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/openfoodfacts.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/openfoodfacts.service")>();
  return {
    ...actual,
    lookupBarcode: vi.fn(),
  };
});

vi.mock("../../services/usda.service", () => ({
  lookupByBarcode: vi.fn(),
}));

import { lookupBarcode } from "../../services/barcode-lookup.service";
import * as openfoodfacts from "../../services/openfoodfacts.service";
import * as usda from "../../services/usda.service";

const mockOFF = openfoodfacts.lookupBarcode as ReturnType<typeof vi.fn>;
const mockUSDA = usda.lookupByBarcode as ReturnType<typeof vi.fn>;

describe("barcode-lookup.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns OFF result when found (USDA not called)", async () => {
    mockOFF.mockResolvedValue({
      found: true,
      name: "Organic Valley Whole Milk",
      brand: "Organic Valley",
      quantity: 1,
      unit: "L",
      category: "Dairy",
    });

    const result = await lookupBarcode("3270190207924");

    expect(result.found).toBe(true);
    expect(result.name).toBe("Organic Valley Whole Milk");
    expect(mockUSDA).not.toHaveBeenCalled();
  });

  it("falls back to USDA when OFF returns not found", async () => {
    mockOFF.mockResolvedValue({ found: false });
    mockUSDA.mockResolvedValue({
      fdcId: 456,
      description: "All Purpose Flour",
      brandOwner: "Great Value",
      gtinUpc: "0078742370781",
      householdServingFullText: "30 g",
      brandedFoodCategory: "flour",
    });

    const result = await lookupBarcode("0078742370781");

    expect(result.found).toBe(true);
    expect(result.name).toBe("Great Value All Purpose Flour");
    expect(result.brand).toBe("Great Value");
    expect(result.quantity).toBe(30);
    expect(result.unit).toBe("g");
    expect(result.category).toBe("Grains & Bread");
    expect(mockUSDA).toHaveBeenCalledWith("0078742370781", expect.any(Number));
  });

  it("returns not found when both OFF and USDA miss", async () => {
    mockOFF.mockResolvedValue({ found: false });
    mockUSDA.mockResolvedValue(null);

    const result = await lookupBarcode("0000000000");

    expect(result).toEqual({ found: false });
  });

  it("does not duplicate brand in name when already present", async () => {
    mockOFF.mockResolvedValue({ found: false });
    mockUSDA.mockResolvedValue({
      fdcId: 456,
      description: "Great Value All Purpose Flour",
      brandOwner: "Great Value",
      gtinUpc: "0078742370781",
    });

    const result = await lookupBarcode("0078742370781");

    expect(result.name).toBe("Great Value All Purpose Flour");
  });

  it("uses servingSize/servingSizeUnit as fallback when householdServing is empty", async () => {
    mockOFF.mockResolvedValue({ found: false });
    mockUSDA.mockResolvedValue({
      fdcId: 456,
      description: "Flour",
      brandOwner: "Great Value",
      gtinUpc: "0078742370781",
      servingSize: 30,
      servingSizeUnit: "g",
    });

    const result = await lookupBarcode("0078742370781");

    expect(result.quantity).toBe(30);
    expect(result.unit).toBe("g");
  });

  it("returns not found when OFF throws", async () => {
    mockOFF.mockRejectedValue(new Error("network error"));

    const result = await lookupBarcode("0078742370781");

    expect(result).toEqual({ found: false });
  });

  it("maps brandedFoodCategory to app category", async () => {
    mockOFF.mockResolvedValue({ found: false });
    mockUSDA.mockResolvedValue({
      fdcId: 456,
      description: "Cheddar Cheese",
      brandOwner: "Great Value",
      gtinUpc: "0078742370781",
      brandedFoodCategory: "Cheese",
    });

    const result = await lookupBarcode("0078742370781");

    expect(result.category).toBe("Dairy");
  });
});
