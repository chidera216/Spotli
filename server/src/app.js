import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import followRoutes from "./routes/followRoutes.js";
import bookmarkRoutes from "./routes/bookmarkRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

import { protect } from "./middleware/authMiddleware.js";

import { tusHandler, finalizeUpload, cancelUpload } from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 5000;

// ------------------------------------------------------
// CORS configuration
// ------------------------------------------------------

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const configuredOrigins = String(process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = new Set(
  ["http://localhost:5173", "http://localhost:4173", ...configuredOrigins].map(
    normalizeOrigin,
  ),
);

const corsOptions = {
  origin(origin, callback) {
    // Allow requests without an Origin header, such as local
    // command-line health checks.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(normalizeOrigin(origin))) {
      return callback(null, true);
    }

    console.warn("Spotli CORS blocked origin:", origin);

    return callback(new Error("Origin not allowed by CORS"));
  },

  credentials: true,

  methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Authorization",
    "Cache-Control",
    "Content-Type",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Upload-Length",
    "Upload-Offset",
    "Upload-Metadata",
    "Upload-Defer-Length",
    "Upload-Concat",
    "Upload-Checksum",
    "Upload-Expires",
    "X-HTTP-Method-Override",
  ],

  exposedHeaders: [
    "Location",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Tus-Max-Size",
    "Upload-Offset",
    "Upload-Length",
    "Upload-Metadata",
    "Upload-Expires",
    "Upload-Concat",
    "Upload-Checksum",
  ],

  optionsSuccessStatus: 204,
  maxAge: 600,
};

// Browser preflight requests must complete successfully before
// authentication runs.
//
// TUS also uses OPTIONS for protocol discovery. Those requests
// must reach the TUS server, so only normal browser preflights
// are terminated by the CORS middleware.

app.use((req, res, next) => {
  const isBrowserCorsPreflight =
    req.method === "OPTIONS" &&
    Boolean(req.headers["access-control-request-method"]);

  const options = {
    ...corsOptions,
    preflightContinue: !isBrowserCorsPreflight,
  };

  return cors(options)(req, res, next);
});

// ------------------------------------------------------
// Request parsing and cookies
// ------------------------------------------------------

app.use(
  express.json({
    limit: "2mb",

    verify(req, _res, buffer) {
      if (
        req.originalUrl?.includes("/api/posts/cloudinary/eager-notification")
      ) {
        req.rawBody = Buffer.from(buffer);
      }
    },
  }),
);

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ------------------------------------------------------
// TUS resumable video uploads
// ------------------------------------------------------

// The TUS server handles the initial upload request and
// subsequent requests identified by the upload ID.
//
// Browser CORS preflights have already been handled above.
// TUS protocol OPTIONS requests must reach tusHandler without
// authentication, because they only discover protocol support.
//
// Actual upload operations require an authenticated Spotli user.

app.all(["/api/upload/tus", "/api/upload/tus/:uploadId"], (req, res) => {
  if (req.method === "OPTIONS") {
    return tusHandler(req, res);
  }

  return protect(req, res, () => tusHandler(req, res));
});

// Check whether Cloudinary has finished processing the upload.

app.post("/api/upload/finalize", protect, finalizeUpload);

// Cancel an upload and request cleanup.

app.post("/api/upload/cancel", protect, cancelUpload);

// ------------------------------------------------------
// Health check
// ------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Spotli API is running",
  });
});

// ------------------------------------------------------
// Existing application routes
// ------------------------------------------------------

app.use("/api/auth", authRoutes);

app.use("/api/posts", postRoutes);

app.use("/uploads", express.static(path.resolve("uploads")));

app.use("/api/users", followRoutes);

app.use("/api/bookmarks", bookmarkRoutes);

app.use("/api/notifications", notificationRoutes);

// ------------------------------------------------------
// Error handling
// ------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error(
    "Spotli API error:",
    err?.error?.message || err?.message || "Unknown server error",
  );

  if (res.headersSent) {
    return;
  }

  if (err?.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed.",
    });
  }

  return res.status(err?.status || 500).json({
    success: false,
    message:
      err?.error?.message ||
      err?.message ||
      "An unexpected server error occurred.",
  });
});

// ------------------------------------------------------
// Start server
// ------------------------------------------------------

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`Spotli API running at http://localhost:${PORT}`);

      console.log("Allowed frontend origins:", [...allowedOrigins]);
    });

    // TUS uploads are resumable and split into chunks.
    // This allows requests enough time to transfer a chunk.

    server.requestTimeout = 5 * 60 * 1000;

    server.headersTimeout = 5 * 60 * 1000 + 10_000;

    server.keepAliveTimeout = 65_000;

    server.on("error", (error) => {
      console.error("Spotli server failed:", error.message);
    });
  } catch (error) {
    console.error("Failed to start Spotli:", error?.message || error);

    process.exitCode = 1;
  }
}

startServer();

export default app;
