import express from "express";
import session from "express-session";
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
import preferencesRouter from "./routes/preferences";

const PgSession = connectPgSimple(session);

const app = express();

// View engine
app.set("view engine", "ejs");
app.set("views", config.viewsPath);

// Health check (before session/auth middleware to avoid DB dependency for ALB)
app.use("/health", healthRouter);

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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

// Routes
app.use("/", authRouter);
app.use("/", dashboardRouter);
app.use("/pantry", pantryRouter);
app.use("/recipes", recipesRouter);
app.use("/nutrition", nutritionRouter);
app.use("/preferences", preferencesRouter);

// Error handler
app.use(errorHandler);

export default app;
