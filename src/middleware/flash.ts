import { Request, Response, NextFunction } from "express";
import "../types";

export function flashMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  next();
}

export function setFlash(
  req: Request,
  type: string,
  message: string
) {
  if (!req.session.flash) {
    req.session.flash = [];
  }
  req.session.flash.push({ type, message });
}
