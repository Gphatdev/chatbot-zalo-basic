function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (minutes) parts.push(`${minutes} phút`);
  parts.push(`${seconds} giây`);
  return parts.join(" ");
}

export default {
  name: "uptime",
  description: "Hiển thị thời gian bot đã chạy",
  version: "1.0.0",
  author: "NKNP V3",
  group: "system",
  role: 0,
  cooldown: 3,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, config }) {
    const startedAt = config.startedAt || Date.now();
    const uptimeMs = Date.now() - startedAt;
    await adapter.sendText({
      threadId: message.threadId,
      threadType: message.type === 1 ? "group" : "user",
      text: `⏱️ ${config.botName} đã hoạt động được ${formatDuration(uptimeMs)}.`,
    });
  },
};
