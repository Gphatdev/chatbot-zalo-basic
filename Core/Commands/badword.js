import { resolveSenderRole } from "../CommandRouter.js";

function getSetting(db, threadId, key, fallback = "") {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );
  return rows.length ? rows[0].value : fallback;
}

function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, String(value)],
  );
}

function getWords(db, threadId) {
  try {
    const parsed = JSON.parse(getSetting(db, threadId, "badword:words", "[]"));
    return Array.isArray(parsed) ? parsed.filter((word) => typeof word === "string") : [];
  } catch {
    return [];
  }
}

function saveWords(db, threadId, words) {
  setSetting(db, threadId, "badword:words", JSON.stringify(words));
}

function normalize(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsBadWord(text, words) {
  const normalized = normalize(text);
  return words.some((word) => {
    const escaped = escapeRegex(normalize(word));
    if (!escaped) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(normalized);
  });
}

async function reply(adapter, threadId, text) {
  await adapter.sendText({ threadId, threadType: "group", text });
}

export default {
  name: "badword",
  description: "Lọc từ cấm do quản trị viên thiết lập",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["loctu", "tucam"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "Lệnh này chỉ dùng trong nhóm." });
      return;
    }
    const sub = (args[0] || "status").toLowerCase();
    const enabled = getSetting(db, threadId, "badword:enabled", "0") === "1";
    if (sub === "status") {
      await reply(adapter, threadId, `🧹 Lọc từ cấm đang ${enabled ? "BẬT" : "TẮT"}; danh sách có ${getWords(db, threadId).length} mục.`);
      return;
    }

    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role < 1) {
      await reply(adapter, threadId, "Chỉ quản trị viên hoặc owner được cấu hình từ cấm.");
      return;
    }

    if (sub === "on" || sub === "off") {
      setSetting(db, threadId, "badword:enabled", sub === "on" ? "1" : "0");
      await reply(adapter, threadId, `✅ Đã ${sub === "on" ? "bật" : "tắt"} lọc từ cấm.`);
      return;
    }
    if (sub === "list") {
      const words = getWords(db, threadId);
      await reply(adapter, threadId, words.length ? `📋 Từ cấm: ${words.join(", ")}` : "📋 Danh sách từ cấm đang trống.");
      return;
    }

    const value = args.slice(1).join(" ").trim();
    if (!value || value.length > 100) {
      await reply(adapter, threadId, "Cú pháp: !badword add <từ/cụm từ> | del <từ/cụm từ> | list | on | off");
      return;
    }
    let words = getWords(db, threadId);
    if (sub === "add") {
      if (words.length >= 200) {
        await reply(adapter, threadId, "Danh sách đã đạt giới hạn 200 mục.");
        return;
      }
      if (!words.some((word) => normalize(word) === normalize(value))) words.push(value);
      saveWords(db, threadId, words);
      await reply(adapter, threadId, `✅ Đã thêm “${value}” vào danh sách từ cấm.`);
      return;
    }
    if (sub === "del" || sub === "remove") {
      const before = words.length;
      words = words.filter((word) => normalize(word) !== normalize(value));
      saveWords(db, threadId, words);
      await reply(adapter, threadId, before === words.length ? "Không tìm thấy mục đó trong danh sách." : `✅ Đã xóa “${value}” khỏi danh sách.`);
      return;
    }
    await reply(adapter, threadId, "Cú pháp: !badword on|off|status|list|add <từ>|del <từ>");
  },

  async onMessage({ adapter, message, config, db }) {
    if (message.type !== 1 || message.isSelf) return;
    const text = typeof message.data?.content === "string" ? message.data.content : null;
    if (text === null) return;
    const threadId = message.threadId;
    if (getSetting(db, threadId, "badword:enabled", "0") !== "1") return;
    const words = getWords(db, threadId);
    if (!words.length || !containsBadWord(text, words)) return;

    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role >= 1) return;
    try {
      await adapter.deleteMessage(message);
    } catch {
      // Nếu bot không có quyền xóa, vẫn gửi cảnh báo bên dưới.
    }
    await reply(adapter, threadId, "⚠️ Tin nhắn có từ không phù hợp đã bị chặn. Vui lòng dùng ngôn từ lịch sự.");
  },
};
