/*
 * Electron main process.
 *
 * Migrated from electron-webpack to Vite + vite-plugin-electron:
 *   - In dev, the plugin sets VITE_DEV_SERVER_URL; we load that.
 *   - In production we load the built renderer (dist/renderer/index.html),
 *     which sits next to this file's output at dist/main/index.js.
 */

import { app, BrowserWindow, screen, Menu, MenuItem, shell } from "electron";
import * as path from "path";
import openAboutWindow from "about-window";
import openHelpWindow from "./help";
import pkg from "../../package.json";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Reference the primary display size (kept for parity with the original).
  screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1000,
    height: 570,
    webPreferences: {
      // The renderer is a bundled browser app (Phaser) and needs no Node;
      // webSecurity is relaxed so file:// asset loads aren't blocked.
      webSecurity: false,
    },
  });

  customizeMenu();

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Best-effort additions to the default application menu (About / docs / issues).
 * The default menu's structure varies by Electron version and platform, so the
 * whole thing is guarded — failure here must never block app launch.
 */
function customizeMenu() {
  try {
    const menu = Menu.getApplicationMenu();
    const helpSubmenu = menu?.items.find((item) => item.role === "help")?.submenu;
    if (!menu || !helpSubmenu) return;

    const icon = path.join(__dirname, "../renderer/favicon.ico");
    helpSubmenu.append(new MenuItem({ type: "separator" }));
    helpSubmenu.append(
      new MenuItem({
        label: "Documentation",
        click: () => openHelpWindow({ icon_path: icon, homepage: pkg.homepage }),
      }),
    );
    helpSubmenu.append(
      new MenuItem({
        label: "Report an Issue",
        click: () => shell.openExternal(pkg.homepage + "/issues"),
      }),
    );
    helpSubmenu.append(
      new MenuItem({
        label: "About OpenLotR2",
        click: () => openAboutWindow({ icon_path: icon, homepage: pkg.homepage }),
      }),
    );
    Menu.setApplicationMenu(menu);
  } catch {
    // Menu customization is non-essential; ignore failures.
  }
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  // On macOS apps typically stay active until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
