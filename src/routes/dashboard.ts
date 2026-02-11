import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "../db/client";
import { savedRecipes } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import * as pantryService from "../services/pantry.service";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const expiringItems = await pantryService.getExpiringItems(userId, 7);

  const allItems = await pantryService.getItems(userId);
  const pantryCount = allItems.length;

  const recentRecipes = await db
    .select()
    .from(savedRecipes)
    .where(eq(savedRecipes.userId, userId))
    .orderBy(desc(savedRecipes.createdAt))
    .limit(5);

  res.render("pages/dashboard", {
    title: "Dashboard",
    expiringItems,
    pantryCount,
    recentRecipes,
  });
});

export default router;
