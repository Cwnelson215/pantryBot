import path from "path";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { config } from "./config";
import { pool } from "./db/client";
import { loadUser } from "./middleware/auth";
import { csrfMiddleware } from "./middleware/csrf";
import { flashMiddleware } from "./middleware/flash";
import { errorHandler } from "./middleware/error";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import dashboardRouter from "./routes/dashboard";
import pantryRouter from "./routes/pantry";
import recipesRouter from "./routes/recipes";
import nutritionRouter from "./routes/nutrition";
import groceryRouter from "./routes/grocery";
import preferencesRouter from "./routes/preferences";

const PgSession = connectPgSimple(session);

const app = express();

// Trust ALB proxy for correct X-Forwarded-Proto handling
app.set("trust proxy", 1);

// View engine
app.set("view engine", "ejs");
app.set("views", config.viewsPath);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

// Health check (before session/auth middleware to avoid DB dependency for ALB)
app.use("/health", healthRouter);

// Static files
app.use(express.static(path.join(__dirname, "..", "public")));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

// Sessions
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
    },
  })
);

// Global middleware
app.use(flashMiddleware);
app.use(loadUser);
app.use(csrfMiddleware);

// Rate limiting (disabled in test to avoid flaky test failures)
if (config.nodeEnv !== "test") {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many attempts, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/login", authLimiter);
  app.use("/register", authLimiter);
  app.use("/nutrition/api", apiLimiter);
  app.use("/recipes/search", apiLimiter);
}

// Routes
app.use("/", authRouter);
app.use("/", dashboardRouter);
app.use("/pantry", pantryRouter);
app.use("/recipes", recipesRouter);
app.use("/grocery", groceryRouter);
app.use("/nutrition", nutritionRouter);
app.use("/preferences", preferencesRouter);

// 404 catch-all
app.use((req, res) => {
  res.status(404).render("pages/error", {
    title: "Not Found",
    message: "The page you're looking for doesn't exist.",
  });
});

// Error handler
app.use(errorHandler);

export default app;
