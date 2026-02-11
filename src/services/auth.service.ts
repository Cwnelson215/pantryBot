import bcrypt from "bcrypt";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

export async function registerUser(
  email: string,
  password: string,
  displayName?: string
) {
  // Check if email already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (existing.length > 0) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: displayName || null,
    })
    .returning();

  const user = result[0];
  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function loginUser(email: string, password: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (result.length === 0) {
    return null;
  }

  const user = result[0];
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function getUserById(id: number) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id));

  if (result.length === 0) {
    return null;
  }

  const user = result[0];
  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
