import { db } from "../db/client";
import { groceryLists, groceryListItems } from "../db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";

// ── Ingredient Classification ────────────────────────────────────────────────

interface RecipeIngredient {
  name?: string;
  original?: string;
  amount?: number;
  unit?: string;
  aisle?: string;
}

interface ClassifiedIngredients {
  missing: RecipeIngredient[];
  partial: { ingredient: RecipeIngredient; pantryItemName: string }[];
  matched: RecipeIngredient[];
}

export function classifyIngredients(
  recipeIngredients: RecipeIngredient[],
  pantryItems: { name: string }[]
): ClassifiedIngredients {
  const result: ClassifiedIngredients = {
    missing: [],
    partial: [],
    matched: [],
  };

  const pantryNames = pantryItems.map((p) => p.name.toLowerCase().trim());

  for (const ingredient of recipeIngredients) {
    const ingredientName = (ingredient.name || ingredient.original || "")
      .toLowerCase()
      .trim();

    if (!ingredientName) {
      result.missing.push(ingredient);
      continue;
    }

    let exactMatch = false;
    let partialMatch: string | null = null;

    for (const pantryName of pantryNames) {
      if (ingredientName === pantryName) {
        exactMatch = true;
        break;
      }

      // Word-boundary partial match: pantry item appears in recipe ingredient or vice versa
      const pantryRegex = new RegExp(`\\b${escapeRegex(pantryName)}\\b`, "i");
      const ingredientRegex = new RegExp(
        `\\b${escapeRegex(ingredientName)}\\b`,
        "i"
      );

      if (pantryRegex.test(ingredientName) || ingredientRegex.test(pantryName)) {
        partialMatch = pantryItems.find(
          (p) => p.name.toLowerCase().trim() === pantryName
        )!.name;
      }
    }

    if (exactMatch) {
      result.matched.push(ingredient);
    } else if (partialMatch) {
      result.partial.push({ ingredient, pantryItemName: partialMatch });
    } else {
      result.missing.push(ingredient);
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Deduplication ────────────────────────────────────────────────────────────

export function deduplicateItems(
  items: { name: string; amount?: string; unit?: string; sourceRecipeTitle?: string }[]
): { name: string; amount?: string; unit?: string; sourceRecipeTitle?: string }[] {
  const seen = new Map<
    string,
    { name: string; amount?: string; unit?: string; sourceRecipeTitle?: string }
  >();

  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

export async function createList(userId: number, name: string) {
  const result = await db
    .insert(groceryLists)
    .values({ userId, name })
    .returning();

  return result[0];
}

export async function getLists(userId: number) {
  return db
    .select()
    .from(groceryLists)
    .where(eq(groceryLists.userId, userId))
    .orderBy(desc(groceryLists.createdAt));
}

export async function getList(id: number, userId: number) {
  const result = await db
    .select()
    .from(groceryLists)
    .where(and(eq(groceryLists.id, id), eq(groceryLists.userId, userId)));

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

export async function getListItems(listId: number) {
  return db
    .select()
    .from(groceryListItems)
    .where(eq(groceryListItems.listId, listId))
    .orderBy(asc(groceryListItems.category), asc(groceryListItems.name));
}

export async function addItems(
  listId: number,
  items: {
    name: string;
    amount?: string;
    unit?: string;
    category?: string;
    sourceRecipeTitle?: string;
  }[]
) {
  if (items.length === 0) return [];

  const result = await db
    .insert(groceryListItems)
    .values(
      items.map((item) => ({
        listId,
        name: item.name,
        amount: item.amount || null,
        unit: item.unit || null,
        category: item.category || null,
        sourceRecipeTitle: item.sourceRecipeTitle || null,
      }))
    )
    .returning();

  return result;
}

export async function addCustomItem(
  listId: number,
  name: string,
  amount?: string,
  unit?: string
) {
  const result = await db
    .insert(groceryListItems)
    .values({
      listId,
      name,
      amount: amount || null,
      unit: unit || null,
      isCustom: 1,
    })
    .returning();

  return result[0];
}

export async function toggleItem(itemId: number, listId: number) {
  const items = await db
    .select()
    .from(groceryListItems)
    .where(
      and(
        eq(groceryListItems.id, itemId),
        eq(groceryListItems.listId, listId)
      )
    );

  if (items.length === 0) return null;

  const newChecked = items[0].checked === 0 ? 1 : 0;

  const result = await db
    .update(groceryListItems)
    .set({ checked: newChecked })
    .where(
      and(
        eq(groceryListItems.id, itemId),
        eq(groceryListItems.listId, listId)
      )
    )
    .returning();

  return result[0];
}

export async function removeItem(itemId: number, listId: number) {
  const items = await db
    .select()
    .from(groceryListItems)
    .where(
      and(
        eq(groceryListItems.id, itemId),
        eq(groceryListItems.listId, listId)
      )
    );

  if (items.length === 0) return null;

  await db
    .delete(groceryListItems)
    .where(
      and(
        eq(groceryListItems.id, itemId),
        eq(groceryListItems.listId, listId)
      )
    );

  return items[0];
}

export async function deleteList(id: number, userId: number) {
  const existing = await getList(id, userId);
  if (!existing) return null;

  await db
    .delete(groceryLists)
    .where(and(eq(groceryLists.id, id), eq(groceryLists.userId, userId)));

  return existing;
}
