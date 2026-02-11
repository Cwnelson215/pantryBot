import { Router } from "express";
import { guestOnly } from "../middleware/auth";
import { setFlash } from "../middleware/flash";
import * as authService from "../services/auth.service";

const router = Router();

router.get("/login", guestOnly, (_req, res) => {
  res.render("pages/login", { title: "Login" });
});

router.post("/login", guestOnly, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    setFlash(req, "error", "Email and password are required");
    return res.redirect("/login");
  }

  try {
    const user = await authService.loginUser(email, password);

    if (!user) {
      setFlash(req, "error", "Invalid email or password");
      return res.redirect("/login");
    }

    req.session.userId = user.id;
    setFlash(req, "success", "Welcome back!");
    res.redirect("/");
  } catch (err) {
    setFlash(req, "error", "Invalid email or password");
    res.redirect("/login");
  }
});

router.get("/register", guestOnly, (_req, res) => {
  res.render("pages/register", { title: "Register" });
});

router.post("/register", guestOnly, async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    setFlash(req, "error", "All fields are required");
    return res.redirect("/register");
  }

  try {
    const user = await authService.registerUser(email, password, displayName);
    req.session.userId = user.id;
    setFlash(req, "success", "Account created successfully!");
    res.redirect("/");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Registration failed";
    setFlash(req, "error", message);
    res.redirect("/register");
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
