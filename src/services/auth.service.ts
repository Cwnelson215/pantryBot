import bcrypt from "bcrypt";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

// Pre-computed dummy hash used to equalize bcrypt timing when no user matches a
// login attempt. Comparing against this on the "no such user" path keeps the
// response time roughly constant, preventing email enumeration via timing.
const DUMMY_HASH_PROMISE = bcrypt.hash("dummy-password-for-timing", SALT_ROUNDS);

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

  const user = result[0];
  // Always run a bcrypt comparison — against the real hash if the user exists,
  // otherwise against the dummy hash — so both the "unknown email" and "wrong
  // password" paths take roughly the same time and return the same null result.
  const hash = user ? user.passwordHash : await DUMMY_HASH_PROMISE;
  const isValid = await bcrypt.compare(password, hash);

  if (!user || !isValid) {
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
