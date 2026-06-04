// ═══════════════════════════════════════
// Local dev server — runs the API routes alongside Vite
// Usage: node server.dev.js
// This is NOT used in production (Vercel handles it)
// ═══════════════════════════════════════

import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";

// Import the serverless function handlers
import sendConfirmation from "./api/send-confirmation.js";
import sendReminders from "./api/send-reminders.js";

const app = express();
const PORT = 3000;

// Parse JSON request bodies for API routes
app.use(express.json());

// Mount the API routes so they work locally just like on Vercel
app.all("/api/send-confirmation", sendConfirmation);
app.all("/api/send-reminders", sendReminders);

// Create a Vite dev server in middleware mode to serve the React frontend
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});

// Let Vite handle all non-API requests (serves React app with HMR)
app.use(vite.middlewares);

app.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║  📱 WhatsApp Appointment Reminders — DEV MODE   ║");
  console.log("  ╠══════════════════════════════════════════════════╣");
  console.log(`  ║  🌐 App:     http://localhost:${PORT}/              ║`);
  console.log(`  ║  📡 API:     http://localhost:${PORT}/api/...       ║`);
  console.log("  ║  ⚡ HMR:     enabled (Vite)                     ║");
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log("");
});
