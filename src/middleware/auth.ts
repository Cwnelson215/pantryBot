import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import "../types";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

export function guestOnly(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    return res.redirect("/");
  }
  next();
}

export async function loadUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.locals.user = null;

  if (req.session.userId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (user) {
      res.locals.user = user;
    } else {
      req.session.destroy(() => {});
      return res.redirect("/login");
    }
  }

  next();
}
