import { renderHelpDetail, renderHelpImage } from "../../Utils/HelpImageRenderer.js";

function findCommand(commands, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return (
    commands.get(normalizedQuery) ||
    [...commands.values()].find((command) =>
      command.aliases?.some((alias) => alias.toLowerCase() === normalizedQuery),
    )
  );
}

async function sendTextFallback(adapter, threadId, threadType, text) {
  await adapter.sendText({ threadId, threadType, text });
}

function buildHelpCaption(prefix) {
  return (
    `🤖HỆ THỐNG HELP NKNP\n` +
    `📌Prefix: ${prefix}\n` +
    `👑Author: GIAPHAT DEV\n` +
    `💗Cảm Ơn Bạn Đã Sử Dụng Dịch Vụ`
  );
}

export default {
  name: "help",
  description: "Hiển thị menu command dạng hình ảnh hoặc thông tin chi tiết",
  version: "2.0.0",
  author: "NKNP V3",
  group: "system",
  role: 0,
  cooldown: 3,
  aliases: ["h", "menu"],
  noPrefix: false,

  async run({ adapter, message, args, commands, config }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const prefix = config.botPrefix;
    const query = args[0];

    if (query) {
      const command = findCommand(commands, query);
      if (!command) {
        await sendTextFallback(
          adapter,
          threadId,
          threadType,
          `🔎 Không tìm thấy lệnh "${query}". Dùng ${prefix}help để xem danh sách command.`,
        );
        return;
      }

      try {
        const imagePath = await renderHelpDetail({ botName: config.botName, prefix, command });
        await adapter.sendImage({
          threadId,
          threadType,
          imagePath,
          message: { text: buildHelpCaption(prefix) },
        });
      } catch {
        await sendTextFallback(
          adapter,
          threadId,
          threadType,
          `📖 ${prefix}${command.name}\n${command.description || "Chưa có mô tả"}\n` +
            `🔐 Quyền yêu cầu: ${command.role}\n⏱️ Thời gian chờ: ${command.cooldown}s`,
        );
      }
      return;
    }

    try {
      const imagePath = await renderHelpImage({ botName: config.botName, prefix, commands });
      await adapter.sendImage({
        threadId,
        threadType,
        imagePath,
        message: { text: buildHelpCaption(prefix) },
      });
    } catch {
      const grouped = new Map();
      for (const command of commands.values()) {
        const groupName = command.group || "general";
        if (!grouped.has(groupName)) grouped.set(groupName, []);
        grouped.get(groupName).push(command.name);
      }

      const lines = [`📋 Danh sách command của ${config.botName}\n⌨️ Prefix: ${prefix}`];
      for (const [groupName, names] of [...grouped.entries()].sort()) {
        lines.push(`\n• ${groupName}: ${names.sort().join(", ")}`);
      }
      lines.push(`\n💡 Dùng ${prefix}help <tên lệnh> để xem chi tiết.`);
      await sendTextFallback(adapter, threadId, threadType, lines.join(""));
    }
  },
};
