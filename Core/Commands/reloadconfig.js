/**
 * [PORT TỪ NKNP] reloadconfig.js
 * Tự động chuyển đổi bởi codemod NKNP V3 — logic bên trong giữ nguyên vẹn,
 * chỉ thay đổi phần "vỏ bọc" (module.exports -> wrapLegacyCommand).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";


const __legacyConfig = {
  name: 'reloadconfig',
  version: '1.0.0',
  role: 2,
  author: 'ShinTHL09',
  description: 'Tải lại cấu hình bot',
  category: 'Hệ thống',
  usage: 'reloadconfig',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ event, api }) => {
  const { threadId, type } = event;

  const { reloadConfig } = require("../../Utils/LegacyUtils.cjs");

  await reloadConfig();

  return api.sendMessage("✅ Đã tải lại cấu hình bot thành công.", threadId, type);

};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
