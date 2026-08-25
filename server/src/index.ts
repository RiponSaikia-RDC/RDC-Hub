import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";

import authRoutes from "./routes/auth";
import plantRoutes from "./routes/plants";
import queryTypeRoutes from "./routes/queryTypes";
import userRoutes from "./routes/users";
import assignmentRoutes from "./routes/assignments";
import requestRoutes from "./routes/requests";
import attachmentRoutes from "./routes/attachments";
import faqRoutes from "./routes/faq";
import adminRoutes from "./routes/admin";
import { startEmailPoller } from "./lib/emailPoller";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cookieParser());

// Only needed in dev, where the Vite dev server (a different origin) calls
// this API directly. In production the server serves the built client
// itself, so requests are same-origin and CORS isn't exercised.
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
}

app.use("/api/auth", authRoutes);
app.use("/api/plants", plantRoutes);
app.use("/api/query-types", queryTypeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api", attachmentRoutes); // mounts /api/requests/:id/attachments and /api/attachments/:id/download
app.use("/api/faq", faqRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve the built React app as static files so the whole platform runs as
// a single process (important for simple hosting on the company server).
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

app.listen(PORT, () => {
  console.log(`RDC Hub server listening on http://localhost:${PORT}`);
  startEmailPoller();
});
