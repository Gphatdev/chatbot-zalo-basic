export default {
  name: "ping",
  description: "Kiểm tra độ trễ của bot",
  version: "1.0.0",
  author: "NKNP V3",
  group: "system",
  role: 0,
  cooldown: 2,
  aliases: ["p"],
  noPrefix: false,

  async run({ adapter, message }) {
    const start = Date.now();
    const elapsed = Date.now() - start;
    await adapter.sendText({
      threadId: message.threadId,
      threadType: message.type === 1 ? "group" : "user",
      text: `🏓 Pong! Bot đang phản hồi ổn định (${elapsed}ms).`,
    });
  },
};
