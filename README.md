# NEXUS — Student Project & Resource Portal

NEXUS is a static frontend served by a small Node.js backend. The backend keeps the Gemini API key on the server and proxies text and text-to-speech requests to Google's Gemini Interactions API.

## Requirements

- Node.js 20 or newer (native `fetch` is used).
- A Gemini API key created in Google AI Studio.
- A terminal in the project folder.

## 1. Configure your environment

```bash
npm install
```

The repository includes a local `.env` template. Edit `.env` and set:

- `GEMINI_API_KEY`: your **new** Gemini API key.
- `ADMIN_PASSCODE`: a strong admin passcode with at least 12 characters.
- `SESSION_SECRET`: a random secret with at least 32 characters.
- `PORT`: optional; defaults to `3000`.

Generate a session secret with one of these commands:

```bash
# macOS / Linux
openssl rand -hex 32

# PowerShell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Never paste your API key into `public/`, HTML, CSS, JavaScript, browser storage, screenshots, source control, or a public issue.

## 2. Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

For a normal production process:

```bash
npm start
```

Deploy the Node server behind HTTPS. Configure the production `.env` variables in your hosting provider's secret/environment-variable settings rather than committing `.env`.

## 3. Run checks

```bash
npm run check
npm test
```

`npm run check` checks JavaScript syntax. `npm test` runs the Gemini payload and response-helper tests.

## Repository layout

```text
nexus-secure/
├── .env                         # Local secrets; ignored by Git
├── .env.example                 # Safe environment-variable template
├── .gitignore
├── README.md
├── package.json
├── server.js                    # Express server, security headers, API proxy, admin session
├── src/
│   └── gemini.js                # Gemini request/response helpers
├── public/
│   ├── index.html               # App markup
│   ├── css/
│   │   └── styles.css           # App styling
│   ├── js/
│   │   ├── app.js               # Browser-side UI logic (no secrets)
│   │   └── projects.js          # Default project metadata
│   └── data/
│       └── line-following-robot.ino
└── tests/
    └── gemini.test.js
```

## API routes

- `GET /api/health` — server status and whether a Gemini key is configured (does not reveal the key).
- `POST /api/gemini/chat` — sends a text interaction to Gemini.
- `POST /api/gemini/tts` — generates speech audio.
- `POST /api/admin/login` — validates the admin passcode and sets an HTTP-only, same-site session cookie.
- `GET /api/admin/session` — checks whether the session is valid.
- `POST /api/admin/logout` — clears the session cookie.

The Gemini key is read only by `server.js` from `process.env.GEMINI_API_KEY`. It is attached to the Google request on the server, never returned to the browser.

## Important security and data notes

1. **Rotate the key that was embedded in the uploaded HTML.** It was exposed in browser-delivered source. Revoke/delete it in Google AI Studio and create a new key. Do not reuse it.
2. `.env` is excluded by `.gitignore`. Commit `.env.example`, not `.env`.
3. The admin passcode is checked by the server and the session cookie is HTTP-only. Keep `SESSION_SECRET` private and rotate it if exposed.
4. Project additions, edits, deletions and customizations are stored in the current browser's `localStorage`. They are not shared with other users and are not server-persisted. A database-backed project CMS would be a separate next step.
5. Rate limiting and Helmet security headers are enabled. Keep the server behind HTTPS in production and configure your hosting provider's request limits and monitoring.
6. The original project notes contain conflicting ESP32 wiring and firmware pin maps. The app displays the firmware pin map and a warning. Verify the actual hardware model, wiring labels and power ratings before powering the robot.

## Troubleshooting

- **Gemini not configured:** check that `.env` is in the project root and `GEMINI_API_KEY` contains a newly created valid key; restart the server after editing it.
- **401/403 from Gemini:** check the key, API access and key restrictions in Google AI Studio.
- **404/model error:** verify that your project has access to `GEMINI_TEXT_MODEL` and `GEMINI_TTS_MODEL`.
- **Browser page cannot reach `/api`:** use `http://localhost:3000` from the Express server, not by opening `public/index.html` as a `file://` URL.
- **Admin login disabled:** set both `ADMIN_PASSCODE` and a `SESSION_SECRET` of at least 32 characters in `.env`.
