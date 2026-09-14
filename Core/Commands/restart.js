/**
 * [PORT TỪ NKNP] restart.js
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
  name: 'restart',
  asliases: ['rs'],
  version: '1.0.0',
  role: 2,
  author: 'ShinTHL09',
  description: 'Khởi động lại bot để áp dụng thay đổi',
  category: 'Hệ thống',
  usage: 'restart',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ event, api }) => {
  const { threadId, type } = event;

  await api.sendMessage("🔄 Bot sẽ khởi động lại trong giây lát để áp dụng thay đổi.", threadId, type);

  return process.exit(2);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
