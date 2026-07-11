/**
 * Electron shell — a phone-shaped window and nothing else. All P2P, wallet,
 * and AI work lives in the peer daemon (peer.js); the renderer talks to it
 * over localhost, so no native modules ever load under Electron's ABI.
 *
 * Env: PUNT_UI_PORT (daemon port), PUNT_ROLE (window title).
 */
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const uiPort = process.env.PUNT_UI_PORT ?? "9701";
const role = process.env.PUNT_ROLE ?? "CREATOR";

app.whenReady().then(() => {
  // speech-to-bet: allow the renderer's mic; audio never leaves the machine
  // (transcription runs on-device in the peer daemon)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
  const win = new BrowserWindow({
    width: 400,
    height: 800,
    resizable: false,
    title: `Punt — ${role.toLowerCase()}`,
    backgroundColor: "#090c12",
    webPreferences: { contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"), { query: { api: `http://127.0.0.1:${uiPort}` } });
});

app.on("window-all-closed", () => app.quit());
