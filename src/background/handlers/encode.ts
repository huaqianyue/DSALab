import { typedIpcMain, getACP } from "../basicUtil";
import * as iconv from "iconv-lite";

// Codepages that are missing from iconv-lite
const missingCP: { [key: string]: string } = {
  "1200": "utf-16le",
  "1201": "utf-16be",
  "12000": "utf-32le",
  "12001": "utf-32be",
  // "16969": "utf-64le",
  "20127": "ascii",
  "65000": "utf-7",
  "65001": "utf-8",
};

typedIpcMain.handle('encode/getAcp', (_) => {
  const cp: string = getACP().toString();
  if (cp in missingCP)
    return missingCP[cp];
  // iconv, used by MinGW, only recognize cp-prefix codepages
  return "cp" + cp;
});

typedIpcMain.handle('encode/verify', (_, encode: string) => {
  return iconv.encodingExists(encode);
});
