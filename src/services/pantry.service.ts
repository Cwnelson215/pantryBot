import { db } from "../db/client";
import { pantryItems } from "../db/schema";
import { eq, and, asc, sql } from "drizzle-orm";

export async function getItems(userId: number) {
  return db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.userId, userId))
    .orderBy(asc(pantryItems.category), asc(pantryItems.name));
}

export async function getItem(id: number, userId: number) {
  const result = await db
    .select()
    .from(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)));

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

const DEFAULT_STAPLE_NAMES = [
  "eggs", "milk", "flour", "sugar", "butter", "salt", "pepper",
  "olive oil", "vegetable oil", "garlic", "onion", "rice", "bread",
  "cheese", "pasta", "baking powder", "baking soda",
];

function isDefaultStaple(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return DEFAULT_STAPLE_NAMES.some(
    (s) => lower === s || lower.includes(s) || s.includes(lower)
  );
}

export async function addItem(
  userId: number,
  data: {
    name: string;
    quantity?: string;
    unit?: string;
    category?: string;
    expirationDate?: string;
    notes?: string;
    barcode?: string;
    isStaple?: string | number;
  }
) {
  const staple =
    data.isStaple !== undefined && data.isStaple !== ""
      ? Number(data.isStaple) ? 1 : 0
      : isDefaultStaple(data.name) ? 1 : 0;

  const result = await db
    .insert(pantryItems)
    .values({
      userId,
      name: data.name,
      quantity: data.quantity || null,
      unit: data.unit || null,
      category: data.category || null,
      expirationDate: data.expirationDate || null,
      notes: data.notes || null,
      barcode: data.barcode || null,
      originalQuantity: data.quantity || null,
      isStaple: staple,
    })
    .returning();

  return result[0];
}

export async function updateItem(
  id: number,
  userId: number,
  data: {
    name?: string;
    quantity?: string;
    unit?: string;
    category?: string;
    expirationDate?: string;
    notes?: string;
    barcode?: string;
    isStaple?: string | number;
  }
) {
  // Verify ownership
  const existing = await getItem(id, userId);
  if (!existing) {
    return null;
  }

  const updateData: Record<string, unknown> = {
    updatedAt: sql`NOW()`,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.quantity !== undefined) {
    updateData.quantity = data.quantity;
    // If quantity increases (restock), update originalQuantity
    const newQty = parseFloat(data.quantity);
    const oldQty = existing.quantity ? parseFloat(existing.quantity) : 0;
    if (newQty > oldQty) {
      updateData.originalQuantity = data.quantity;
    }
  }
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.expirationDate !== undefined)
    updateData.expirationDate = data.expirationDate;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.barcode !== undefined) updateData.barcode = data.barcode;
  if (data.isStaple !== undefined && data.isStaple !== "")
    updateData.isStaple = Number(data.isStaple) ? 1 : 0;

  const result = await db
    .update(pantryItems)
    .set(updateData)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
    .returning();

  return result[0];
}

export async function deleteItem(id: number, userId: number) {
  // Verify ownership
  const existing = await getItem(id, userId);
  if (!existing) {
    return null;
  }

  await db
    .delete(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)));

  return existing;
}

export async function getExpiringItems(userId: number, days: number = 7) {
  return db
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.userId, userId),
        sql`${pantryItems.expirationDate} IS NOT NULL`,
        sql`${pantryItems.expirationDate} >= CURRENT_DATE`,
        sql`${pantryItems.expirationDate} <= CURRENT_DATE + interval '${sql.raw(days.toString())} days'`
      )
    )
    .orderBy(asc(pantryItems.expirationDate));
}

export async function deductQuantity(
  id: number,
  userId: number,
  amount: number
) {
  const item = await getItem(id, userId);
  if (!item) return null;

  const oldQuantity = item.quantity ? parseFloat(item.quantity) : 0;
  const newQuantity = Math.max(0, oldQuantity - amount);

  // If originalQuantity was never set, snapshot current quantity before deduction
  const updateData: Record<string, unknown> = {
    quantity: newQuantity.toString(),
    updatedAt: sql`NOW()`,
  };
  if (!item.originalQuantity) {
    updateData.originalQuantity = oldQuantity.toString();
  }

  await db
    .update(pantryItems)
    .set(updateData)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)));

  return {
    item,
    oldQuantity,
    newQuantity,
    originalQuantity: item.originalQuantity
      ? parseFloat(item.originalQuantity)
      : oldQuantity,
  };
}

export async function getItemsByCategory(userId: number) {
  const items = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.userId, userId))
    .orderBy(asc(pantryItems.category), asc(pantryItems.name));

  const grouped: Record<string, typeof items> = {};

  for (const item of items) {
    const category = item.category || "Uncategorized";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(item);
  }

  return grouped;
}
