import { extraResourcesPath, getWebContents, getWindow, typedIpcMain } from "../basicUtil";

typedIpcMain.handle('window/toggleDevTools', (_) => {
  getWebContents().toggleDevTools();
});

typedIpcMain.handle('window/setTitle', (_, title) => {
  if (title === "") getWindow().setTitle('DSALab');
  else getWindow().setTitle(title + ' - DSALab');
});

typedIpcMain.handle('window/getArgv', (_) => process.argv);

typedIpcMain.handle('window/getExtraResourcePath', (_) => extraResourcesPath);
