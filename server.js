import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import {
  GEMINI_INTERACTIONS_URL,
  buildChatPayload,
  buildTtsPayload,
  safeGeminiError
} from "./src/gemini.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT) || 3000;
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
const SESSION_COOKIE = "nexus_admin_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["https://www.youtube-nocookie.com"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: "256kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a minute." }
});

app.use("/api/", apiLimiter);

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes("PASTE_YOUR_NEW")) {
    const error = new Error("Gemini is not configured. Add a new GEMINI_API_KEY to your .env file.");
    error.status = 503;
    throw error;
  }

  let upstream;
  try {
    upstream = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
  } catch (error) {
    const wrapped = new Error(
      error?.name === "TimeoutError"
        ? "Gemini request timed out. Try again."
        : "Could not reach Google Gemini. Check the server network connection."
    );
    wrapped.status = 502;
    throw wrapped;
  }

  const raw = await upstream.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error(`Gemini returned an unreadable response (HTTP ${upstream.status}).`);
    error.status = 502;
    throw error;
  }

  if (!upstream.ok || data?.status === "failed") {
    const message = safeGeminiError(data, upstream.status, upstream.statusText);
    const error = new Error(message);
    error.status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    throw error;
  }

  return data;
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 32 || secret.startsWith("REPLACE_WITH_")) return null;
  return secret;
}

function signExpiry(expiry) {
  const secret = getSessionSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(String(expiry)).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeSessionToken() {
  const expiry = Date.now() + SESSION_LIFETIME_MS;
  const signature = signExpiry(expiry);
  if (!signature) return null;
  return `${expiry}.${signature}`;
}

function isAdminRequest(req) {
  const token = req.cookies?.[SESSION_COOKIE] || readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token || !getSessionSecret()) return false;

  const [expiryText, signature] = token.split(".");
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !signature) return false;

  const expected = signExpiry(expiry);
  return Boolean(expected && safeEqual(signature, expected));
}

function readCookie(header, name) {
  if (!header) return "";
  const prefix = `${name}=`;
  const pair = header.split(";").map(item => item.trim()).find(item => item.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : "";
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_LIFETIME_MS,
    path: "/"
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes("PASTE_YOUR_NEW")
    )
  });
});

app.post("/api/gemini/chat", async (req, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
  if (!input) return jsonError(res, 400, "Enter a message before sending.");
  if (input.length > 8000) return jsonError(res, 413, "Message is too long (maximum 8,000 characters).");

  try {
    const payload = buildChatPayload({
      input,
      systemInstruction: req.body?.systemInstruction,
      previousInteractionId: req.body?.previousInteractionId,
      model: TEXT_MODEL,
      store: req.body?.store !== false
    });
    const data = await callGemini(payload);
    return res.json(data);
  } catch (error) {
    return jsonError(res, error.status || 500, error.message || "Gemini request failed.");
  }
});

app.post("/api/gemini/tts", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return jsonError(res, 400, "Text is required for voice generation.");
  if (text.length > 12000) return jsonError(res, 413, "Voice text is too long.");

  try {
    const payload = buildTtsPayload({
      text,
      model: TTS_MODEL,
      voice: "Kore"
    });
    const data = await callGemini(payload);
    return res.json(data);
  } catch (error) {
    return jsonError(res, error.status || 500, error.message || "Gemini voice request failed.");
  }
});

app.post("/api/admin/login", (req, res) => {
  const configuredPasscode = process.env.ADMIN_PASSCODE || "";
  const enteredPasscode = typeof req.body?.passcode === "string" ? req.body.passcode : "";

  if (
    configuredPasscode.length < 12 ||
    configuredPasscode.startsWith("REPLACE_WITH_") ||
    !getSessionSecret()
  ) {
    return jsonError(res, 503, "Admin login is not configured. Set ADMIN_PASSCODE and SESSION_SECRET in .env.");
  }

  if (!enteredPasscode || !safeEqual(enteredPasscode, configuredPasscode)) {
    return jsonError(res, 401, "Incorrect admin passcode.");
  }

  const token = makeSessionToken();
  if (!token) return jsonError(res, 503, "Could not create an admin session.");
  setSessionCookie(res, token);
  return res.json({ authenticated: true, expiresInSeconds: SESSION_LIFETIME_MS / 1000 });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: isAdminRequest(req) });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  res.json({ authenticated: false });
});

// Only expose the static frontend after the API routes have been registered.
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return jsonError(res, 404, "API route not found.");
  return res.status(404).send("Page not found.");
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error?.message || error);
  if (res.headersSent) return;
  return jsonError(res, 500, "An unexpected server error occurred.");
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`NEXUS is running at http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("PASTE_YOUR_NEW")) {
      console.warn("Gemini is not configured. Add GEMINI_API_KEY to .env.");
    }
  });
}

export { app, isAdminRequest };
