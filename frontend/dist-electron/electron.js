import require$$0 from "electron";
import require$$1 from "path";
import require$$2 from "fs/promises";
var electron = {};
const { app, BrowserWindow, ipcMain, dialog } = require$$0;
const path = require$$1;
const { readFile } = require$$2;
process.env.DIST = path.join(__dirname, "../dist");
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.PUBLIC, "vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
ipcMain.handle("open-file-dialog", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"]
  });
  if (!canceled) {
    return filePaths[0];
  }
});
ipcMain.handle("read-file-content", async (event, filePath) => {
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    console.error("Failed to read file content:", error);
    return null;
  }
});
export {
  electron as default
};
