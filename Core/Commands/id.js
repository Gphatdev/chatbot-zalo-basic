export default {
  name: "id",
  description: "Hiển thị sender ID và thread ID hiện tại",
  version: "1.0.0",
  author: "NKNP V3",
  group: "system",
  role: 0,
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message }) {
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const threadTypeLabel = message.type === 1 ? "Nhóm" : "Cá nhân";

    await adapter.sendText({
      threadId,
      threadType: message.type === 1 ? "group" : "user",
      text: `🆔 ID người gửi: ${senderId}\n🧵 ID cuộc trò chuyện: ${threadId}\n📌 Loại cuộc trò chuyện: ${threadTypeLabel}`,
    });
  },
};
