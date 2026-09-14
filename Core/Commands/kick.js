
function resolveTargetUid(message, args) {
  // 1. Mention trong tin nhắn nhóm (data.mentions: TMention[] | undefined)
  const mention = message.data.mentions?.[0];
  if (mention?.uid) return mention.uid;

  // 2. Reply vào tin nhắn cũ (data.quote.ownerId)
  const quoteOwnerId = message.data.quote?.ownerId;
  if (quoteOwnerId) return quoteOwnerId;

  // 3. UID được gõ trực tiếp làm tham số
  if (args[0] && /^\d+$/.test(args[0])) return args[0];

  return null;
}

export default {
  name: "kick",
  description: "Kick một thành viên khỏi nhóm (tag, reply, hoặc dán UID)",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 1, // chỉ admin nhóm đã xác minh hoặc owner
  cooldown: 3,
  aliases: ["remove"],
  noPrefix: false,

  async run({ adapter, message, args, config }) {
    const threadId = message.threadId;

    if (message.type !== 1) {
      await adapter.sendText({
        threadId,
        threadType: "user",
        text: "🏠 Lệnh !kick chỉ có thể sử dụng trong nhóm.",
      });
      return;
    }

    const targetUid = resolveTargetUid(message, args);

    if (!targetUid) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text:
          "Cú pháp: !kick @tag, reply tin nhắn của người đó rồi gõ !kick, " +
          "hoặc dùng !kick <uid>.",
      });
      return;
    }

    const senderId = message.data.uidFrom;
    const ownId = adapter.getOwnId();

    if (targetUid === senderId) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "Bạn không thể tự kick chính mình 🙂",
      });
      return;
    }

    if (targetUid === ownId) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "Bot không thể tự kick chính mình.",
      });
      return;
    }

    if (targetUid === config.ownerZaloId) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "Không thể kick owner của bot.",
      });
      return;
    }

    try {
      const result = await adapter.removeUsersFromGroup([targetUid], threadId);
      const failed = result?.errorMembers?.includes(targetUid);

      if (failed) {
        await adapter.sendText({
          threadId,
          threadType: "group",
          text:
            "Không thể kick thành viên này. Có thể bot không đủ quyền quản trị " +
            "trong nhóm, hoặc thành viên đã rời nhóm.",
        });
      } else {
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `Đã kick thành viên (UID: ${targetUid}) khỏi nhóm.`,
        });
      }
    } catch (err) {
      if (err?.code === "FEATURE_UNAVAILABLE") {
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "Tính năng kick hiện không khả dụng trong phiên bản zca-mt đang dùng.",
        });
      } else {
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: "Đã xảy ra lỗi khi kick thành viên. Vui lòng thử lại sau.",
        });
      }
    }
  },
};