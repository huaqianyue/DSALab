import * as fallbackTheme from '../../extraResources/themes/classic.json';
import * as fs from 'fs';
import * as path from 'path';
import { extraResourcesPath, store, typedIpcMain } from '../basicUtil';
import { Theme } from '../ipcTyping';

typedIpcMain.handle('theme/getList', (_) => {
  const themePath = path.join(extraResourcesPath, 'themes');
  if (!fs.existsSync(themePath)) return [];
  const themeList = fs.readdirSync(themePath)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -5));
  return themeList;
});

typedIpcMain.handle('theme/getData', (_, name?) => {
  if (typeof name === 'undefined') {
    name = store.get('theme.active');
  }
  const jsonPath = path.join(extraResourcesPath, 'themes', `${name}.json`);
  if (!fs.existsSync(jsonPath)) {
    return {
      success: false,
      theme: <Theme>fallbackTheme,
      error: `Theme file ${name}.json not found.`
    };
  }
  let theme: Theme | null = null;
  try {
    theme = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(e);
    return {
      success: false,
      theme: <Theme>fallbackTheme,
      error: `Theme file ${name}.json is not a valid JSON file.`
    };
  }
  // validate
  if (!(('type' in theme) &&
    ('name' in theme) &&
    (theme.type === 'dark' || theme.type === 'light'))) {
    console.error("Invalid theme type");
    return {
      success: false,
      theme: <Theme>fallbackTheme,
      error: `Theme file ${name}.json is not a valid theme file.`
    };
  }

  return {
    success: true,
    theme: {
      type: theme.type,
      name: theme.name,
      colors: {
        debugStep: fallbackTheme.colors.debugStep,
        breakpoint: fallbackTheme.colors.breakpoint,
        ...theme.colors
      },
      boldTokens: theme.boldTokens ?? [],
      italicTokens: theme.italicTokens ?? [],
      underlineTokens: theme.underlineTokens ?? []
    }
  };
});
