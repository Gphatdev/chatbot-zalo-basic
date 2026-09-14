import { resolveSenderRole } from "../CommandRouter.js";

function getSetting(db, threadId, key, defaultValue) {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );
  return rows.length > 0 ? rows[0].value : defaultValue;
}

function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, value],
  );
}

async function warnSender({ adapter, message }, text) {
  await adapter.sendText({
    threadId: message.threadId,
    threadType: "group",
    text,
  });
}

async function tryDeleteMessage({ adapter, logger }, message) {
  try {
    await adapter.deleteMessage(message);
    return true;
  } catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") {
      logger?.warn?.("[limit] Không thể xóa tin nhắn:", { message: err?.message });
    }
    return false;
  }
}

export default {
  name: "limit",
  description: "Cấm thành viên sử dụng lệnh theo nhóm (vd: system, game)",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["lockcmd"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    const isGroup = message.type === 1;

    if (!isGroup) {
      await adapter.sendText({
        threadId,
        threadType: "user",
        text: "Lệnh !limit chỉ áp dụng cho hội thoại nhóm.",
      });
      return;
    }

    const sub = (args[0] || "").toLowerCase();

    if (sub === "status" || !sub) {
      const isEnabled = getSetting(db, threadId, "anti:limit:enabled", "0") === "1";
      const blockedGroups = getSetting(db, threadId, "anti:limit:groups", "")
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean);

      let statusText = `🛡️ Trạng thái Khóa Lệnh Theo Nhóm:\n• Trạng thái: ${isEnabled ? "BẬT" : "TẮT"}\n`;
      statusText += `• Nhóm đang cấm: ${blockedGroups.length > 0 ? blockedGroups.join(", ") : "(Chưa cấm nhóm nào)"}`;

      await adapter.sendText({ threadId, threadType: "group", text: statusText });
      return;
    }

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      message.data.uidFrom,
    );

    if (senderRole < 1) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "Bạn cần là quản trị viên nhóm hoặc owner để thực hiện lệnh này.",
      });
      return;
    }

    switch (sub) {
      case "on": {
        setSetting(db, threadId, "anti:limit:enabled", "1");
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "✅ Đã BẬT chế độ khóa lệnh theo nhóm.",
        });
        break;
      }

      case "off": {
        setSetting(db, threadId, "anti:limit:enabled", "0");
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "✅ Đã TẮT chế độ khóa lệnh.",
        });
        break;
      }

      case "add": {
        const groupToAdd = (args[1] || "").toLowerCase();
        if (!groupToAdd) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: "Cú pháp: !limit add <tên nhóm>\nVí dụ: !limit add system",
          });
          return;
        }
        const current = getSetting(db, threadId, "anti:limit:groups", "")
          .split(",")
          .map((g) => g.trim().toLowerCase())
          .filter(Boolean);

        if (current.includes(groupToAdd)) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: `Nhóm "${groupToAdd}" đã có trong danh sách cấm.`,
          });
          return;
        }

        current.push(groupToAdd);
        setSetting(db, threadId, "anti:limit:groups", current.join(","));
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `🚫 Đã thêm nhóm "${groupToAdd}" vào danh sách cấm lệnh.`,
        });
        break;
      }

      case "del":
      case "remove": {
        const groupToDel = (args[1] || "").toLowerCase();
        if (!groupToDel) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: "Cú pháp: !limit del <tên nhóm>\nVí dụ: !limit del system",
          });
          return;
        }
        const currentGroups = getSetting(db, threadId, "anti:limit:groups", "")
          .split(",")
          .map((g) => g.trim().toLowerCase())
          .filter(Boolean)
          .filter((g) => g !== groupToDel);

        setSetting(db, threadId, "anti:limit:groups", currentGroups.join(","));
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `✅ Đã xóa nhóm "${groupToDel}" khỏi danh sách cấm lệnh.`,
        });
        break;
      }

      case "clear": {
        setSetting(db, threadId, "anti:limit:groups", "");
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "✅ Đã xóa toàn bộ danh sách nhóm bị cấm.",
        });
        break;
      }

      default:
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "Cú pháp: !limit on|off | add <nhóm> | del <nhóm> | clear | status",
        });
    }
  },

  async onMessage({ adapter, message, config, db, logger, commands }) {
    if (message.type !== 1) return;
    if (message.isSelf) return;

    const text = typeof message.data.content === "string" ? message.data.content : null;
    if (text === null) return;

    const prefix = config.prefix || "!";
    if (!text.startsWith(prefix)) return;

    const threadId = message.threadId;
    const senderId = message.data.uidFrom;

    const limitEnabled = getSetting(db, threadId, "anti:limit:enabled", "0") === "1";
    if (!limitEnabled) return;

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      senderId,
    );

    if (senderRole >= 1) return;

    const cmdMap = commands instanceof Map ? commands : new Map();

    const cmdName = text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();

    if (cmdName === "limit") return;

    const cmdObj = cmdMap.get(cmdName);

    if (!cmdObj) return;

    const blockedGroups = getSetting(db, threadId, "anti:limit:groups", "")
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);

    if (blockedGroups.length === 0) return;

    const cmdGroup = (cmdObj.group || "").toLowerCase();

    if (blockedGroups.includes(cmdGroup)) {
      const ctx = { adapter, message, logger };
      await tryDeleteMessage(ctx, message);

      const groupListStr = blockedGroups.map((g) => `• ${g}`).join("\n");
      await warnSender(
        ctx,
        `⚠️ Quản trị viên đã cấm sử dụng các lệnh thuộc nhóm:\n${groupListStr}\n\nLệnh bạn vừa dùng thuộc nhóm "${cmdGroup}" nên đã bị xóa.`,
      );
    }
  },
};