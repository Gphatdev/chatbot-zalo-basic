import { resolveSenderRole } from "../CommandRouter.js";

const WARN_LIMIT = 3;

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

function getMentionIds(message) {
  const candidates = [message?.data?.mentions, message?.data?.content?.mentions];
  for (const mentions of candidates) {
    if (!Array.isArray(mentions)) continue;
    const ids = mentions
      .map((item) => item?.uid ?? item?.userId ?? item?.id)
      .filter(Boolean)
      .map(String);
    if (ids.length) return [...new Set(ids)];
  }
  return [];
}

async function reply(adapter, threadId, text) {
  await adapter.sendText({ threadId, threadType: "group", text });
}

export default {
  name: "warn",
  description: "Cảnh cáo thành viên trong nhóm",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["canhcao"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "🏠 Lệnh cảnh cáo chỉ có thể sử dụng trong nhóm." });
      return;
    }

    const senderId = String(message.data.uidFrom);
    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      senderId,
    );
    if (role < 1) {
      await reply(adapter, threadId, "🔐 Chỉ quản trị viên nhóm hoặc owner mới có thể cảnh cáo thành viên.");
      return;
    }

    const sub = (args[0] || "").toLowerCase();
    const targetId = getMentionIds(message)[0];
    if (!targetId) {
      await reply(adapter, threadId, "Cú pháp: !warn @thành_viên [lý do] | !warn check @thành_viên | !warn reset @thành_viên\nVí dụ: !warn @thành_viên spam link");
      return;
    }
    if (targetId === senderId) {
      await reply(adapter, threadId, "Bạn không thể tự cảnh cáo chính mình.");
      return;
    }
    if (targetId === String(adapter.getOwnId())) {
      await reply(adapter, threadId, "Không thể cảnh cáo tài khoản bot.");
      return;
    }

    const countKey = `warn:count:${targetId}`;
    if (sub === "check") {
      const count = Number(getSetting(db, threadId, countKey, "0")) || 0;
      await reply(adapter, threadId, `📋 Thành viên ${targetId} hiện có ${count}/${WARN_LIMIT} cảnh cáo.`);
      return;
    }
    if (sub === "reset") {
      setSetting(db, threadId, countKey, "0");
      setSetting(db, threadId, `warn:reason:${targetId}`, "");
      await reply(adapter, threadId, `✅ Đã xóa toàn bộ cảnh cáo của thành viên ${targetId}.`);
      return;
    }

    const targetRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      targetId,
    );
    if (targetRole >= role) {
      await reply(adapter, threadId, "Bạn không thể cảnh cáo owner hoặc quản trị viên có quyền ngang/cao hơn.");
      return;
    }

    const count = (Number(getSetting(db, threadId, countKey, "0")) || 0) + 1;
    const reasonStart = args.findIndex((arg) => arg.startsWith("@"));
    const reason = args.slice(reasonStart >= 0 ? reasonStart + 1 : 1).join(" ").trim() || "Không ghi lý do";
    setSetting(db, threadId, countKey, count);
    setSetting(db, threadId, `warn:reason:${targetId}`, reason);
    await reply(
      adapter,
      threadId,
      `⚠️ Đã cảnh cáo thành viên ${targetId}.\n• Mức: ${count}/${WARN_LIMIT}\n• Lý do: ${reason}`,
    );
  },
};
