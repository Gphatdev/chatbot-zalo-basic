/**
 * [PORT TỪ NKNP] tt.js
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
const { ThreadType } = require("zca-js");
const { db } = require("../../Utils/LegacyDb.cjs");

const TZ = "Asia/Ho_Chi_Minh";

// Tự tạo bảng nếu chưa có, phòng trường hợp loader nạp lệnh 'tt' trước khi
// event 'tuongtac' kịp chạy (CREATE TABLE IF NOT EXISTS nên gọi lại vô hại).
db.exec(`
  CREATE TABLE IF NOT EXISTS Interactions (
    threadId TEXT NOT NULL,
    userId TEXT NOT NULL,
    date TEXT NOT NULL,
    name TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (threadId, userId, date)
  );
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_interactions_thread_date
  ON Interactions (threadId, date);
`);



// Bỏ dấu tiếng Việt để so khớp tham số linh hoạt (tuần/tuan/week...)
function removeAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const __legacyConfig = {
  name: "tt",
  aliases: ["top", "toptt", "bxhtt"],
  version: "2.0.0",
  role: 0,
  author: "Claude",
  description: "Xem bảng xếp hạng tương tác (nhắn tin nhiều nhất) trong nhóm theo tuần hoặc tháng",
  category: "Tiện ích",
  usage: "tt [tuan|thang]",
  cooldowns: 5,
  dependencies: {
    "moment-timezone": ""
  }
};
const __legacyRun = async ({ args, event, api }) => {
  const { threadId, type } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng được trong nhóm.", threadId, type);
  }

  const rawMode = removeAccents(args[0] || "tuan");
  const isMonth = ["thang", "month", "1thang"].includes(rawMode);
  const isWeek = ["tuan", "week", "1tuan"].includes(rawMode);

  if (!isMonth && !isWeek) {
    return api.sendMessage(
      "⚠️ Vui lòng chọn mốc thời gian hợp lệ.\nCú pháp: tt tuan | tt thang",
      threadId, type
    );
  }

  const rangeDays = isMonth ? 30 : 7;
  const label = isMonth ? "1 THÁNG" : "1 TUẦN";

  // Danh sách ngày cần cộng dồn, chỉ lấy đúng threadId hiện tại
  // -> mỗi box/nhóm luôn tách biệt hoàn toàn dữ liệu của nhau.
  const dateKeys = [];
  for (let i = 0; i < rangeDays; i++) {
    dateKeys.push(moment.tz(TZ).subtract(i, "days").format("YYYY-MM-DD"));
  }
  const placeholders = dateKeys.map(() => "?").join(", ");

  const ranking = db.prepare(`
    SELECT
      i1.userId AS userId,
      (
        SELECT i2.name FROM Interactions i2
        WHERE i2.threadId = i1.threadId AND i2.userId = i1.userId
        ORDER BY i2.date DESC
        LIMIT 1
      ) AS name,
      SUM(i1.count) AS total
    FROM Interactions i1
    WHERE i1.threadId = ? AND i1.date IN (${placeholders})
    GROUP BY i1.userId
    ORDER BY total DESC
    LIMIT 10
  `).all(threadId, ...dateKeys);

  if (!ranking || ranking.length === 0) {
    return api.sendMessage(
      `📊 Chưa có dữ liệu tương tác nào trong ${label.toLowerCase()} qua.`,
      threadId, type
    );
  }

  const rankIcons = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️", "🔟"];

  let msg = `╭───────────────────╮\n`;
  msg += `   📊 TOP TƯƠNG TÁC\n`;
  msg += `     (${label} QUA)\n`;
  msg += `╰───────────────────╯\n\n`;

  const mentions = [];

  ranking.forEach((u, i) => {
    const name = u.name || "Không rõ";
    const icon = rankIcons[i] || `${i + 1}.`;
    const prefix = `${icon} `;
    const pos = msg.length + prefix.length; // vị trí bắt đầu của tên (Zalo tự thêm @ khi render mention)
    mentions.push({ uid: u.userId, pos, len: name.length });
    msg += `${prefix}${name} — ${u.total} tin nhắn\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👥 ${ranking.length} người hoạt động`;

  return api.sendMessage({ msg, mentions, ttl: 0 }, threadId, type);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
