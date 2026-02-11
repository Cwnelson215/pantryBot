import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err);

  const status = err.status || 500;
  const message =
    config.nodeEnv === "development"
      ? err.message || "Internal Server Error"
      : "Internal Server Error";

  res.status(status).render("pages/error", {
    title: "Error",
    message,
  });
}
