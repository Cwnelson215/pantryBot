import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import "../types";

export function csrfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }

  res.locals.csrfToken = req.session.csrfToken;

  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    const token = req.body?._csrf;

    if (token !== req.session.csrfToken) {
      return res.status(403).render("pages/error", {
        title: "Forbidden",
        message: "Invalid CSRF token. Please try again.",
      });
    }
  }

  next();
}
