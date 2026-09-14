/**
 * [PORT TỪ NKNP] kickall.js
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

const path = require("path");
const limitPath = path.join(__dirname, "..", "commands", "cache", "limit.json");
const fs = require("fs-extra");

// ============================================================
// 🦶 LỆNH KICKALL - Reply giống hệt lệnh td
// ============================================================

const BOT_ADMINS = [
  // "1234567890123456789",
];

function safeReadJson(fp) {
  try {
    return fs.readJsonSync(fp, { throws: false }) || {};
  } catch {
    return {};
  }
}

async function getGroupInfo(api, threadId) {
  try {
    const groupInfo = await api.getGroupInfo(threadId);
    const info = groupInfo?.gridInfoMap?.[threadId] ||
                 Object.values(groupInfo?.gridInfoMap || {})[0] || {};

    const creatorId = info.creatorId ? String(info.creatorId) : null;
    const admins = Array.isArray(info.adminIds) ? info.adminIds.map(String) : [];

    let members = [];
    if (Array.isArray(info.memVerList)) {
      members = info.memVerList.map(item => String(item).split('_')[0]);
    }

    return { admins, creatorId, members };
  } catch (e) {
    console.error("[kickall] Lỗi:", e.message);
    return { admins: [], creatorId: null, members: [] };
  }
}

async function tryKickMember(api, threadId, targetUid) {
  const attempts = [
    () => api.removeUserFromGroup(targetUid, threadId),
    () => api.removeUserFromGroup([targetUid], threadId),
    () => api.kickUserFromGroup(targetUid, threadId),
    () => api.kickMember(threadId, targetUid),
    () => api.removeMember(threadId, targetUid),
    () => api.removeGroupMember(threadId, targetUid),
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return true;
    } catch (e) {}
  }
  return false;
}





// ====================== HÀM REPLY (GIỐNG TD) ======================
function extractRawReplyContent(params) {
  const event = params?.event || {};
  const candidates = [
    params?.content,
    params?.cleanContent,
    params?.text,
    event?.data?.content,
    event?.content,
    event?.data?.data?.content,
    event?.msg,
    event?.data?.msg,
    event?.data?.body,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

const __legacyConfig = {
  name: "kickall",
  version: "1.0.6-zalo",
  role: 0,
  author: "NKNP",
  description: "Đá tất cả thành viên (reply giống td)",
  category: "group",
  usage: ".kickall",
  cooldowns: 10,
};
const __legacyRun = async ({ args, event, api }) => {
  const { threadId, type, data } = event;
  const senderID = String(data?.uidFrom || "");

  if (!threadId) {
    return api.sendMessage({ msg: "❌ Chỉ dùng trong nhóm." }, threadId, type);
  }

  const { admins, creatorId, members } = await getGroupInfo(api, threadId);

  const isCallerAdmin = admins.includes(senderID) || creatorId === senderID || BOT_ADMINS.includes(senderID);

  if (!isCallerAdmin) {
    return api.sendMessage({ msg: "❌ Chỉ admin/trưởng nhóm mới dùng được." }, threadId, type);
  }

  const toKick = members.filter(uid => 
    uid !== senderID && uid !== creatorId && !admins.includes(uid)
  );

  const text = `⚠️ **CẢNH BÁO NGHIÊM TRỌNG**\n\n` +
               `Sẽ kick **${toKick.length}** thành viên ra khỏi nhóm!\n\n` +
               `Reply **có** để thực hiện\n` +
               `Reply **không** hoặc **hủy** để bỏ qua`;

  const info = await api.sendMessage({ msg: text }, threadId, type);

  const replyPayload = {
    name: "kickall",
    author: senderID,
    toKick: toKick,
    promptMsg: {
      msgId: info?.message?.msgId || info?.msgId,
      cliMsgId: info?.message?.cliMsgId || info?.cliMsgId,
    }
  };

  const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId);
  global.client.handleReply.set(replyMsgId, replyPayload);

  setTimeout(() => global.client.handleReply.delete(replyMsgId), 5 * 60 * 1000);
};
const __legacyOnReply = async (params) => {
  const api = params?.api;
  const event = params?.event || {};
  const { threadId, type, data } = event;

  const quoteMsgId = String(
    params?.quoteMsgId ||
    event?.data?.quote?.globalMsgId ||
    event?.data?.quote?.cliMsgId ||
    event?.data?.quote?.msgId ||
    ""
  );

  if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) return;

  const handleReplyData = global.client.handleReply.get(quoteMsgId);
  if (data?.uidFrom !== handleReplyData.author) return;

  global.client.handleReply.delete(quoteMsgId);

  const rawContent = extractRawReplyContent(params).toLowerCase();

  // Kiểm tra hủy
  if (["không", "hủy", "huỷ", "no", "cancel", "huy"].some(w => rawContent.includes(w))) {
    return api.sendMessage({ msg: "✅ Đã hủy lệnh kickall." }, threadId, type);
  }

  // Kiểm tra xác nhận
  if (!["có", "yes", "ok", "kick", "xác nhận", "confirm"].some(w => rawContent.includes(w))) {
    return api.sendMessage({ 
      msg: "❌ Reply không hợp lệ.\n\nVui lòng reply **có** để kick hoặc **không** để hủy." 
    }, threadId, type);
  }

  // Thực hiện kick
  const toKick = handleReplyData.toKick || [];
  if (toKick.length === 0) {
    return api.sendMessage({ msg: "✅ Không có thành viên nào để kick." }, threadId, type);
  }

  let success = 0, failed = 0;
  await api.sendMessage({ msg: `🔄 Đang kick ${toKick.length} thành viên...` }, threadId, type);

  for (const uid of toKick) {
    const ok = await tryKickMember(api, threadId, uid);
    ok ? success++ : failed++;
  }

  return api.sendMessage({
    msg: `✅ **Kickall hoàn tất!**\n` +
         `• Đã kick: ${success}\n` +
         `• Thất bại: ${failed}\n` +
         `• Còn lại: Bot + Admin/Trưởng nhóm`
  }, threadId, type);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
