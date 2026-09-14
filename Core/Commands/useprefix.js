/**
 * [PORT TỪ NKNP] useprefix.js
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

const moment = require("moment-timezone");

const __legacyConfig = {
  name: 'useprefix',
  version: '1.0.1',
  role: 0,
  author: 'ShinTHL09',
  description: 'Hiện tin nhắn khi sử dụng prefix',
  category: 'Không xài lệnh',
  usage: 'prefix',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ event, api }) => {
    const { threadId, type } = event;

    const timeDate = moment.tz("Asia/Ho_Chi_minh");
    const timeHours = timeDate.format("HH");
    const timeMinutes = timeDate.format("mm");
    const timeSeconds = timeDate.format("ss");
    const dateStr = timeDate.format("DD/MM/YYYY");

    const name_bot = global.config.name_bot;

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const pad = (n) => n.toString().padStart(2, "0");
    const uptimeStr = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    const msg = 
`╔══「 👑 ${name_bot} 👑 」══╗

  ✧ ⏱️  Uptime  : ${uptimeStr}
  ✧ 🕐  Giờ     : ${timeHours}:${timeMinutes}:${timeSeconds}
  ✧ 📅  Ngày    : ${dateStr}
  ✧ 📚  Lệnh    : help / menu

╚══「    Anh Yêu Em      」══╝`;

    await api.sendMessage({ msg, ttl: 20000 }, threadId, type);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
