function getDetailedMenu(cmdName, cmd) {
  let details = `📘 Hướng dẫn lệnh: ${cmdName}\n`;
  details += `📝 Mô tả: ${cmd.description || "Chưa có mô tả"}\n`;
  details += `👨‍💻 Tác giả: ${cmd.author || "Chưa cập nhật"}\n`;
  if (cmd.aliases && cmd.aliases.length > 0) {
    details += `🔗 Lệnh tắt: ${cmd.aliases.join(", ")}\n`;
  }
  details += `⏱️ Cooldown: ${cmd.cooldown || 0}s\n`;

  if (cmdName === "anti") {
    details += `\n` +
      `━━━━━━━━━━ HƯỚNG DẪN SỬ DỤNG ━━━━━━━━━━\n` +
      `1. Xem trạng thái: !anti status\n` +
      `2. Bật/Tắt AntiSpam: !anti spam on|off\n` +
      `3. Hành động Spam: !anti spam action warn|delete|kick\n` +
      `4. Bật/Tắt AntiLink: !anti link on|off\n` +
      `5. Hành động Link: !anti link action warn|delete\n` +
      `6. Thêm Link cho phép: !anti link allow <domain>\n` +
      `7. Xóa Link cho phép: !anti link remove <domain>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  } else {
    details += `\n💡 Hãy nhập lệnh để xem hướng dẫn sử dụng cụ thể.`;
  }

  return details;
}

export default {
  name: "menu",
  description: "Xem danh sách tất cả lệnh và hướng dẫn sử dụng bot",
  version: "1.0.0",
  author: "NKNP V3",
  group: "system",
  role: 0,
  cooldown: 5,
  aliases: ["commands"],
  noPrefix: false,

  async run({ adapter, message, args, commands }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    
    const queryCmd = (args[0] || "").toLowerCase();
    const cmdMap = commands instanceof Map ? commands : new Map();

    if (queryCmd && cmdMap.has(queryCmd)) {
      const cmdDetails = getDetailedMenu(queryCmd, cmdMap.get(queryCmd));
      await adapter.sendText({ threadId, threadType, text: cmdDetails });
      return;
    }

    if (queryCmd && !cmdMap.has(queryCmd)) {
      await adapter.sendText({
        threadId,
        threadType,
        text: `❌ Không tìm thấy lệnh "${queryCmd}". Hãy dùng !menu để xem danh sách lệnh hiện có.`,
      });
      return;
    }

    const groupedCommands = {};

    for (const [name, cmd] of cmdMap.entries()) {
      if (cmd.noPrefix) continue; 

      const group = cmd.group || "Khác";
      if (!groupedCommands[group]) {
        groupedCommands[group] = [];
      }
      groupedCommands[group].push({
        name,
        desc: cmd.description || "Chưa có mô tả",
        role: cmd.role || 0,
      });
    }

    let menuText = `🤖 DANH SÁCH LỆNH BOT\n`;
    menuText += `📌 Hiện có: ${cmdMap.size} lệnh\n`;
    menuText += `━━━━━━━━━━━━━━━━━━━━\n`;

    const groupIcons = {
      system: "⚙️",
      moderation: "🛡️",
      fun: "🎮",
      economy: "💰",
      Khác: "📦"
    };

    for (const [group, cmds] of Object.entries(groupedCommands)) {
      const icon = groupIcons[group] || "📌";
      menuText += `\n${icon} [ ${group.toUpperCase()} ]\n`;
      
      for (const cmd of cmds) {
        const lockIcon = cmd.role >= 1 ? "🔒" : "🔹";
        menuText += `${lockIcon} !${cmd.name}: ${cmd.desc}\n`;
      }
    }

    menuText += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    menuText += `💡 Nhập "!menu <tên lệnh>" để xem hướng dẫn chi tiết.\n`;
    menuText += `Ví dụ: !menu anti`;

    await adapter.sendText({ threadId, threadType, text: menuText });
  },
};