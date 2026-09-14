import { resolveSenderRole } from "../CommandRouter.js";

function getSetting(db, threadId, key, fallback = "0") {
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

function eventName(event) {
  return String(event?.type ?? event?.eventType ?? event?.data?.type ?? event?.data?.action ?? "").toLowerCase();
}

function eventUserIds(event) {
  const data = event?.data ?? {};
  const sources = [data.memberIds, data.userIds, data.members, data.updateMembers, data.uid, data.userId, data.memberId];
  const result = [];
  for (const source of sources) {
    const values = Array.isArray(source) ? source : source ? [source] : [];
    for (const value of values) {
      const id = value?.id ?? value?.uid ?? value?.userId ?? value;
      if (id) result.push(String(id));
    }
  }
  return [...new Set(result)];
}

export default {
  name: "goodbye",
  description: "Thông báo khi thành viên rời nhóm",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["bye"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "🏠 Lệnh này chỉ có thể sử dụng trong nhóm." });
      return;
    }
    const action = (args[0] || "status").toLowerCase();
    if (action === "status") {
      const enabled = getSetting(db, threadId, "goodbye:enabled", "0") === "1";
      await adapter.sendText({ threadId, threadType: "group", text: `👋 Thông báo thành viên rời nhóm đang ${enabled ? "BẬT" : "TẮT"}.` });
      return;
    }
    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role < 1) {
      await adapter.sendText({ threadId, threadType: "group", text: "🔐 Chỉ quản trị viên hoặc owner mới có thể thay đổi cài đặt này." });
      return;
    }
    if (!['on', 'off'].includes(action)) {
      await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !goodbye on | off | status\nVí dụ: !goodbye on" });
      return;
    }
    setSetting(db, threadId, "goodbye:enabled", action === "on" ? "1" : "0");
    await adapter.sendText({ threadId, threadType: "group", text: `✅ Đã ${action === "on" ? "bật" : "tắt"} thông báo thành viên rời nhóm.` });
  },

  async onGroupEvent({ adapter, event, db }) {
    const threadId = event?.threadId;
    if (!threadId || getSetting(db, threadId, "goodbye:enabled", "0") !== "1") return;
    const type = eventName(event);
    if (!type.includes("leave") && !type.includes("remove_member") && !type.includes("remove-member")) return;
    const ids = eventUserIds(event);
    const who = ids.length ? ids.join(", ") : "Một thành viên";
    await adapter.sendText({
      threadId,
      threadType: "group",
      text: `👋 ${who} đã rời khỏi nhóm. Chúc bạn mọi điều thuận lợi!`,
    });
  },
};
