import { db } from "../db/client";
import { pantryItems } from "../db/schema";
import { eq, and, asc, sql, gte, lte } from "drizzle-orm";

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
  }
) {
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
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.expirationDate !== undefined)
    updateData.expirationDate = data.expirationDate;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.barcode !== undefined) updateData.barcode = data.barcode;

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
