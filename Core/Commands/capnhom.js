/**
 * [PORT TỪ NKNP] capnhom.js
 * Tự động chuyển đổi bởi codemod NKNP V3 — logic bên trong giữ nguyên vẹn,
 * chỉ thay đổi phần "vỏ bọc" (module.exports -> wrapLegacyCommand).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";

const { ThreadType } = require("zca-js");
const { getGroupNames } = require("../../Utils/LegacyCommandGroups.cjs");



const pendingPrompts = global.capnhomPrompts || (global.capnhomPrompts = {});
const PROMPT_TTL = 5 * 60 * 1000;

function buildListMessage(bannedGroups) {
  const groupNames = getGroupNames();
  const lines = groupNames.map((name, idx) => {
    const isBanned = bannedGroups.includes(name);
    return `${idx + 1}. ${name}: ${isBanned ? "❎" : "✅"}`;
  });

  return {
    text: `[ Cấm Sử Dụng Nhóm Lệnh ]\n${lines.join("\n")}\n\n📌 Reply STT để bật/tắt nhóm lệnh`,
    groupNames
  };
}

async function checkGroupAdmin(api, threadId, userId) {
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info.gridInfoMap?.[threadId] || {};
    const isCreator = groupInfo.creatorId === userId;
    const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);
    return isCreator || isDeputy;
  } catch {
    return false;
  }
}

const __legacyConfig = {
  name: "capnhom",
  aliases: ["nhomlenh"],
  version: "1.1.0",
  role: 0,
  author: "ShinTHL09 + Fixed",
  description: 'Xem và bật/tắt cấm sử dụng theo từng nhóm lệnh trong nhóm chat.',
  category: "Nhóm",
  usage: "capnhom",
  cooldowns: 3
};
const __legacyRun = async function ({ api, event, Threads }) {
  const { threadId, type, data } = event;
  const userId = data.uidFrom;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng được trong nhóm chat.", threadId, type);
  }

  const isBotAdmin = global.users?.admin?.includes(userId);
  const isGroupAdmin = await checkGroupAdmin(api, threadId, userId);

  if (!isGroupAdmin && !isBotAdmin) {
    return api.sendMessage(
      { msg: "🚫 Chỉ Trưởng nhóm hoặc Phó nhóm mới dùng được lệnh này.", ttl: 20000 },
      threadId, type
    );
  }

  const threadData = await Threads.getData(threadId);
  const bannedGroups = Array.isArray(threadData.data.banned_command_groups)
    ? threadData.data.banned_command_groups
    : [];

  const { text, groupNames } = buildListMessage(bannedGroups);

  const sent = await api.sendMessage(text, threadId, type);

  // Lấy ID đầy đủ hơn (hỗ trợ nhiều phiên bản zca-js)
  const sentIds = [
    sent?.message?.cliMsgId,
    sent?.message?.msgId,
    sent?.message?.globalMsgId,
    sent?.cliMsgId,
    sent?.msgId,
    sent?.globalMsgId,
    sent?.data?.cliMsgId,
    sent?.data?.msgId,
    sent?.data?.globalMsgId
  ]
    .filter(Boolean)
    .map(String);

  pendingPrompts[threadId] = {
    ids: sentIds,
    groupNames,
    createdAt: Date.now()
  };
};
const __legacyHandleEvent = async function ({ api, event, eventType, Threads }) {
  if (eventType !== "message") return;

  const { threadId, type, data } = event;
  if (type !== ThreadType.Group) return;

  const pending = pendingPrompts[threadId];
  if (!pending) return;

  // Hết hạn
  if (Date.now() - pending.createdAt > PROMPT_TTL) {
    delete pendingPrompts[threadId];
    return;
  }

  const quote = data?.quote;
  if (!quote) return;

  // Kiểm tra reply có phải là tin nhắn danh sách không (hỗ trợ nhiều ID)
  const quoteIds = [
    quote.cliMsgId,
    quote.msgId,
    quote.globalMsgId
  ]
    .filter(Boolean)
    .map(String);

  const isReplyToPrompt = quoteIds.some(id => pending.ids.includes(id));
  if (!isReplyToPrompt) return;

  const content = typeof data.content === "string" ? data.content.trim() : "";
  const index = parseInt(content, 10);

  if (!Number.isInteger(index) || String(index) !== content || index < 1 || index > pending.groupNames.length) {
    return;
  }

  const userId = data.uidFrom;
  const isBotAdmin = global.users?.admin?.includes(userId);
  const isGroupAdmin = await checkGroupAdmin(api, threadId, userId);

  if (!isGroupAdmin && !isBotAdmin) {
    return api.sendMessage(
      { msg: "🚫 Chỉ Trưởng nhóm hoặc Phó nhóm mới được phép bật/tắt.", ttl: 20000 },
      threadId, type
    );
  }

  const groupName = pending.groupNames[index - 1];

  const threadData = await Threads.getData(threadId);
  let bannedGroups = Array.isArray(threadData.data.banned_command_groups)
    ? threadData.data.banned_command_groups
    : [];

  const isCurrentlyBanned = bannedGroups.includes(groupName);

  if (isCurrentlyBanned) {
    bannedGroups = bannedGroups.filter(g => g !== groupName);
  } else {
    bannedGroups.push(groupName);
  }

  threadData.data.banned_command_groups = bannedGroups;
  await Threads.setData(threadId, threadData.data);

  // Xóa pending sau khi xử lý xong
  delete pendingPrompts[threadId];

  return api.sendMessage(
    `✅ Đã ${isCurrentlyBanned ? "BẬT LẠI" : "CẤM"} nhóm lệnh "${groupName}" trong nhóm này.`,
    threadId, type
  );
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, __legacyHandleEvent);
