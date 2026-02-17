import { db } from "../db/client";
import { savedRecipes } from "../db/schema";
import { eq, and } from "drizzle-orm";
import * as pantryService from "./pantry.service";
import * as groceryService from "./grocery.service";
import { tryConvert } from "./unit-conversion.service";

// ── Types ───────────────────────────────────────────────────────────────────

interface RecipeIngredient {
  name?: string;
  original?: string;
  amount?: number;
  unit?: string;
}

interface Deduction {
  pantryItemId: number;
  pantryItemName: string;
  ingredientName: string;
  amountDeducted: number;
  unit: string;
  oldQuantity: number;
  newQuantity: number;
}

interface SkippedItem {
  ingredientName: string;
  reason: string;
}

interface ReplenishItem {
  name: string;
  currentQuantity: number;
  originalQuantity: number;
  unit: string;
}

export interface CookPreview {
  recipe: { id: number; title: string; servings: number | null };
  requestedServings: number;
  deductions: Deduction[];
  skipped: SkippedItem[];
  replenishItems: ReplenishItem[];
}

export interface CookResult extends CookPreview {
  autoReplenishListId: number | null;
}

// ── Matching ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPantryMatch(
  ingredientName: string,
  pantryItems: Awaited<ReturnType<typeof pantryService.getItems>>
) {
  const lower = ingredientName.toLowerCase().trim();
  if (!lower) return null;

  // Exact match first
  for (const item of pantryItems) {
    if (item.name.toLowerCase().trim() === lower) return item;
  }

  // Word-boundary partial match
  for (const item of pantryItems) {
    const pantryName = item.name.toLowerCase().trim();
    const pantryRegex = new RegExp(`\\b${escapeRegex(pantryName)}\\b`, "i");
    const ingredientRegex = new RegExp(`\\b${escapeRegex(lower)}\\b`, "i");

    if (pantryRegex.test(lower) || ingredientRegex.test(pantryName)) {
      return item;
    }
  }

  return null;
}

// ── Preview (dry run) ───────────────────────────────────────────────────────

export async function previewCook(
  userId: number,
  recipeId: number,
  servings?: number
): Promise<CookPreview | null> {
  const recipes = await db
    .select()
    .from(savedRecipes)
    .where(and(eq(savedRecipes.id, recipeId), eq(savedRecipes.userId, userId)));

  if (recipes.length === 0) return null;

  const recipe = recipes[0];
  const ingredients: RecipeIngredient[] = Array.isArray(recipe.ingredientsJson)
    ? (recipe.ingredientsJson as RecipeIngredient[])
    : [];

  const pantryItems = await pantryService.getItems(userId);
  const requestedServings = servings || recipe.servings || 1;
  const scale =
    recipe.servings && recipe.servings > 0
      ? requestedServings / recipe.servings
      : 1;

  const deductions: Deduction[] = [];
  const skipped: SkippedItem[] = [];
  const replenishItems: ReplenishItem[] = [];

  for (const ingredient of ingredients) {
    const ingredientName =
      ingredient.name || ingredient.original || "unknown ingredient";

    if (!ingredient.amount) {
      skipped.push({
        ingredientName,
        reason: "No amount specified (used but not tracked)",
      });
      continue;
    }

    const pantryItem = findPantryMatch(ingredientName, pantryItems);
    if (!pantryItem) {
      skipped.push({
        ingredientName,
        reason: "Not found in pantry",
      });
      continue;
    }

    if (!pantryItem.quantity || !pantryItem.unit) {
      skipped.push({
        ingredientName,
        reason: "Pantry item has no quantity/unit set",
      });
      continue;
    }

    const scaledAmount = ingredient.amount * scale;
    const recipeUnit = ingredient.unit || "";
    const pantryUnit = pantryItem.unit;

    let deductAmount: number;
    if (!recipeUnit || recipeUnit === pantryUnit) {
      deductAmount = scaledAmount;
    } else {
      const converted = tryConvert(scaledAmount, recipeUnit, pantryUnit);
      if (converted === null) {
        skipped.push({
          ingredientName,
          reason: `Incompatible units: recipe uses "${recipeUnit}", pantry has "${pantryUnit}"`,
        });
        continue;
      }
      deductAmount = converted;
    }

    const oldQuantity = parseFloat(pantryItem.quantity);
    const newQuantity = Math.max(0, oldQuantity - deductAmount);
    const originalQuantity = pantryItem.originalQuantity
      ? parseFloat(pantryItem.originalQuantity)
      : oldQuantity;

    deductions.push({
      pantryItemId: pantryItem.id,
      pantryItemName: pantryItem.name,
      ingredientName,
      amountDeducted: Math.round(deductAmount * 100) / 100,
      unit: pantryUnit,
      oldQuantity,
      newQuantity: Math.round(newQuantity * 100) / 100,
    });

    // Check if this staple needs replenishing
    if (
      pantryItem.isStaple === 1 &&
      newQuantity < 0.9 * originalQuantity
    ) {
      replenishItems.push({
        name: pantryItem.name,
        currentQuantity: Math.round(newQuantity * 100) / 100,
        originalQuantity,
        unit: pantryUnit,
      });
    }
  }

  return {
    recipe: {
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings,
    },
    requestedServings,
    deductions,
    skipped,
    replenishItems,
  };
}

// ── Confirm Cook (actually deduct) ──────────────────────────────────────────

export async function confirmCook(
  userId: number,
  recipeId: number,
  servings?: number
): Promise<CookResult | null> {
  const preview = await previewCook(userId, recipeId, servings);
  if (!preview) return null;

  // Execute deductions
  const executedDeductions: Deduction[] = [];
  const replenishItems: ReplenishItem[] = [];

  for (const deduction of preview.deductions) {
    const result = await pantryService.deductQuantity(
      deduction.pantryItemId,
      userId,
      deduction.amountDeducted
    );

    if (result) {
      executedDeductions.push({
        ...deduction,
        oldQuantity: result.oldQuantity,
        newQuantity: result.newQuantity,
      });

      // Re-check replenish after actual deduction
      if (
        result.item.isStaple === 1 &&
        result.newQuantity < 0.9 * result.originalQuantity
      ) {
        replenishItems.push({
          name: result.item.name,
          currentQuantity: Math.round(result.newQuantity * 100) / 100,
          originalQuantity: result.originalQuantity,
          unit: result.item.unit || "",
        });
      }
    }
  }

  // Auto-replenish: add items to grocery list
  let autoReplenishListId: number | null = null;
  if (replenishItems.length > 0) {
    const list = await groceryService.getOrCreateAutoReplenishList(userId);
    autoReplenishListId = list.id;

    // Get existing items to avoid duplicates
    const existingItems = await groceryService.getListItems(list.id);
    const existingNames = new Set(
      existingItems.map((i) => i.name.toLowerCase().trim())
    );

    const newItems = replenishItems
      .filter((item) => !existingNames.has(item.name.toLowerCase().trim()))
      .map((item) => ({
        name: item.name,
        amount: item.originalQuantity.toString(),
        unit: item.unit,
        sourceRecipeTitle: preview.recipe.title,
      }));

    if (newItems.length > 0) {
      await groceryService.addItems(list.id, newItems);
    }
  }

  return {
    ...preview,
    deductions: executedDeductions,
    replenishItems,
    autoReplenishListId,
  };
}
