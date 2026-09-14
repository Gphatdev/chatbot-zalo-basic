import { resolveSenderRole } from "../CommandRouter.js";

const SETTING_KEY = "eventlog:enabled";
const tagAllCooldowns = new Map();
const TAG_ALL_COOLDOWN_MS = 5_000;

function getSetting(db, threadId, key, fallback = "1") {
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

function isEnabled(db, threadId) {
  // Mặc định bật; admin có thể dùng !eventlog off.
  return getSetting(db, threadId, SETTING_KEY, "1") === "1";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function displayUser(value, fallback = "Không rõ") {
  if (!value) return fallback;
  if (typeof value !== "object") return String(value);
  const name = firstValue(value.displayName, value.name, value.userName, value.dName);
  const id = firstValue(value.uid, value.userId, value.id, value.memberId);
  if (name && id) return `${name} (${id})`;
  return String(name ?? id ?? fallback);
}

function eventType(event) {
  return String(firstValue(
    event?.type,
    event?.eventType,
    event?.action,
    event?.data?.type,
    event?.data?.eventType,
    event?.data?.action,
  ) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
}

function eventUsers(event) {
  const data = event?.data ?? {};
  const sources = [
    data.updateMembers,
    data.members,
    data.memberIds,
    data.userIds,
    data.users,
    data.member,
    data.user,
    data.uid,
    data.userId,
    data.memberId,
  ];
  const users = [];
  for (const source of sources) {
    const values = Array.isArray(source) ? source : source ? [source] : [];
    for (const value of values) {
      const label = displayUser(value, "");
      if (label) users.push(label);
    }
    if (users.length) break;
  }
  return [...new Set(users)];
}

function actor(event) {
  const data = event?.data ?? {};
  return displayUser(firstValue(
    data.actor,
    data.source,
    data.operator,
    data.creator,
    data.actorId,
    data.sourceId,
    data.uidFrom,
    event?.uidFrom,
  ));
}

function groupEventLog(event) {
  const type = eventType(event);
  const data = event?.data ?? {};
  const users = eventUsers(event);
  const who = users.length ? users.join(", ") : "Một thành viên";
  const by = actor(event);

  if (type.includes("request") && (type.includes("join") || type.includes("member"))) {
    return `📥 YÊU CẦU VÀO NHÓM\n• Người xin vào: ${who}\n• Sự kiện: ${type}`;
  }

  if (type === "leave" || type.includes("leave_group") || type.includes("member_leave")) {
    return `📤 THÀNH VIÊN RỜI NHÓM\n• Thành viên: ${who}`;
  }

  if (type.includes("remove_member") || type.includes("kick")) {
    return `🚪 THÀNH VIÊN BỊ MỜI KHỎI NHÓM\n• Thành viên: ${who}\n• Thực hiện bởi: ${by}`;
  }

  const isRename =
    type.includes("update_name") ||
    type.includes("change_name") ||
    type.includes("rename") ||
    (type.includes("update") && type.includes("group") && data.groupName);
  if (isRename) {
    const oldName = firstValue(data.oldName, data.oldGroupName, data.previousName, "Không rõ");
    const newName = firstValue(data.newName, data.groupName, data.name, "Không rõ");
    return `✏️ ĐỔI TÊN NHÓM\n• Tên cũ: ${oldName}\n• Tên mới: ${newName}\n• Thực hiện bởi: ${by}`;
  }

  return null;
}

function mentions(message) {
  const candidates = [message?.data?.mentions, message?.data?.content?.mentions];
  return candidates.find(Array.isArray) ?? [];
}

function isTagAll(message, text) {
  const normalized = text.toLocaleLowerCase("vi-VN");
  if (/(^|\s)@(all|mọi người|mọi người ơi)(?=\s|$|[,.!?])/iu.test(normalized)) return true;
  return mentions(message).some((mention) => {
    const uid = String(firstValue(mention?.uid, mention?.userId, mention?.id, "")).toLowerCase();
    const label = String(firstValue(mention?.displayName, mention?.name, mention?.text, "")).toLocaleLowerCase("vi-VN");
    return ["-1", "0", "all", "everyone"].includes(uid) || label === "@all" || label.includes("mọi người");
  });
}

async function send(adapter, threadId, text) {
  await adapter.sendText({ threadId, threadType: "group", text });
}

export default {
  name: "eventlog",
  description: "Ghi log các hoạt động quan trọng trong nhóm",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["logbox", "nhatky"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "Lệnh này chỉ dùng trong nhóm." });
      return;
    }

    const action = (args[0] || "status").toLowerCase();
    if (action === "status") {
      await send(adapter, threadId, `📒 Log sự kiện đang ${isEnabled(db, threadId) ? "BẬT" : "TẮT"}.`);
      return;
    }

    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role < 1) {
      await send(adapter, threadId, "Chỉ quản trị viên hoặc owner được thay đổi log sự kiện.");
      return;
    }
    if (!['on', 'off'].includes(action)) {
      await send(adapter, threadId, "Cú pháp: !eventlog on | off | status");
      return;
    }
    setSetting(db, threadId, SETTING_KEY, action === "on" ? "1" : "0");
    await send(adapter, threadId, `✅ Đã ${action === "on" ? "bật" : "tắt"} log sự kiện nhóm.`);
  },

  async onGroupEvent({ adapter, event, db }) {
    const threadId = event?.threadId;
    if (!threadId || !isEnabled(db, threadId)) return;
    const log = groupEventLog(event);
    if (log) await send(adapter, threadId, `📒 NHẬT KÝ NHÓM\n${log}`);
  },

  async onMessage({ adapter, message, db }) {
    if (message.type !== 1 || message.isSelf) return;
    const text = typeof message.data?.content === "string" ? message.data.content : null;
    if (text === null || !isEnabled(db, message.threadId) || !isTagAll(message, text)) return;

    const key = `${message.threadId}:${message.data.uidFrom}`;
    const now = Date.now();
    if (now - (tagAllCooldowns.get(key) || 0) < TAG_ALL_COOLDOWN_MS) return;
    tagAllCooldowns.set(key, now);
    await send(
      adapter,
      message.threadId,
      `📒 NHẬT KÝ NHÓM\n📢 TAG TẤT CẢ THÀNH VIÊN\n• Người tag: ${message.data.uidFrom}\n• Nội dung: ${text.slice(0, 300)}`,
    );
  },
};