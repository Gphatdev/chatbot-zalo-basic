/**
 * [PORT TỪ NKNP] checkff.js
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

const axios = require("axios");



// Danh sách API free (sẽ thử lần lượt cho đến khi thành công)
const FREE_APIS = [
  `https://freefire-info.vercel.app/player/`,
  `https://ff-api.dinhtrungit.com/player/`,
  `https://api-freefire.vercel.app/player/`
];

const __legacyConfig = {
  name: "checkff",
  version: "3.2.0",
  role: 0,
  author: "Grok",
  description: "Kiểm tra thông tin tài khoản Free Fire (Tự động thử nhiều API)",
  category: "Game",
  usages: ".checkff [UID]",
  cooldowns: 5
};
const __legacyRun = async ({ api, event, args }) => {
  const { threadId, type } = event;

  if (!args[0]) {
    return api.sendMessage(
      "📌 Vui lòng nhập UID Free Fire cần kiểm tra.\nVí dụ: .checkff 1234567890",
      threadId, type
    );
  }

  const uid = args[0].trim();

  if (!/^\d{8,12}$/.test(uid)) {
    return api.sendMessage("❌ UID không hợp lệ! UID phải từ 8-12 chữ số.", threadId, type);
  }

  let lastError = null;

  // Thử lần lượt các API
  for (const baseUrl of FREE_APIS) {
    try {
      const res = await axios.get(`${baseUrl}${uid}`, {
        timeout: 12000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      const data = res.data;

      if (data && data.nickname) {
        // Thành công → hiển thị thông tin
        let msg = `🔥 THÔNG TIN TÀI KHOẢN FREE FIRE\n`;
        msg += `━━━━━━━━━━━━━━━━━━\n`;
        msg += `👤 Tên: ${data.nickname}\n`;
        msg += `🆔 UID: ${uid}\n`;
        msg += `📊 Level: ${data.level || "?"} | EXP: ${data.exp || "?"}\n`;
        msg += `🏆 BR Rank: ${data.br_rank || "Chưa rank"} (${data.br_rank_point || 0} điểm)\n`;
        msg += `🎯 CS Rank: ${data.cs_rank || "Chưa rank"} (${data.cs_rank_point || 0} điểm)\n`;
        msg += `🔫 Booyah: ${data.booyah || 0}\n`;
        msg += `💀 Kills: ${data.kills || 0}\n`;
        msg += `🎮 Số trận: ${data.matches || 0}\n`;

        if (data.kd) msg += `📈 K/D: ${data.kd}\n`;
        if (data.clan_name) msg += `👥 Clan: ${data.clan_name}\n`;

        msg += `━━━━━━━━━━━━━━━━━━\n`;
        msg += `⏰ Cập nhật: ${new Date().toLocaleString("vi-VN")}`;

        return api.sendMessage(msg, threadId, type);
      }
    } catch (err) {
      lastError = err;
      // Tiếp tục thử API tiếp theo
      continue;
    }
  }

  // Nếu tất cả API đều thất bại
  console.error("[CHECKFF] Tất cả API đều lỗi. Lỗi cuối cùng:", lastError?.message);

  if (lastError?.response?.status === 404) {
    return api.sendMessage("❌ UID không tồn tại hoặc chưa từng chơi Free Fire.", threadId, type);
  }

  return api.sendMessage(
    "⚠️ Tất cả API hiện đang lỗi hoặc không phản hồi. Vui lòng thử lại sau.",
    threadId, type
  );
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
