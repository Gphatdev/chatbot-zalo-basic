function listLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

export default {
  name: "groupinfo",
  description: "Xem thông tin nhóm hiện tại",
  version: "1.0.0",
  author: "NKNP V3",
  group: "utility",
  role: 0,
  cooldown: 5,
  aliases: ["infobox"],
  noPrefix: false,

  async run({ adapter, message }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "🏠 Lệnh này chỉ có thể sử dụng trong nhóm." });
      return;
    }

    const info = await adapter.getGroupInfo(threadId);
    if (!info) {
      await adapter.sendText({ threadId, threadType: "group", text: "⚠️ Chưa thể lấy thông tin nhóm lúc này. Vui lòng thử lại sau." });
      return;
    }

    const members = info.memberIds ?? info.members ?? info.memVerList;
    const admins = info.adminIds ?? [];
    const name = info.name ?? info.groupName ?? "(chưa xác định)";
    const memberCount = Number(info.totalMember ?? info.memberCount) || listLength(members);
    const createdAt = Number(info.createdTime ?? info.createdAt ?? 0);
    const createdText = createdAt
      ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })
          .format(new Date(createdAt < 10_000_000_000 ? createdAt * 1000 : createdAt))
      : "Chưa xác định";

    await adapter.sendText({
      threadId,
      threadType: "group",
      text:
        `📊 THÔNG TIN NHÓM\n` +
        `• Tên: ${name}\n` +
        `• ID: ${threadId}\n` +
        `• Thành viên: ${memberCount || "Chưa xác định"}\n` +
        `• Quản trị viên: ${listLength(admins)}\n` +
        `• Chủ nhóm: ${info.creatorId ?? "Chưa xác định"}\n` +
        `• Ngày tạo: ${createdText}`,
    });
  },
};
