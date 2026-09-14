/**
 * [PORT TỪ NKNP] qtv.js
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

const __legacyConfig = {
  name: "qtvonly",
  version: "1.0.0",
  role: 0,
  author: "ShinTHL09",
  description: "Bật/tắt chế độ chỉ Trưởng nhóm và Phó nhóm mới được dùng lệnh của bot trong nhóm.",
  category: "Nhóm",
  usage: "qtvonly",
  cooldowns: 3
};
const __legacyRun = async function ({ api, event, Threads }) {
  const { threadId, type, data } = event;
  const userId = data.uidFrom;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
  }

  // Kiểm tra quyền: chỉ Trưởng nhóm hoặc Phó nhóm (hoặc admin bot) mới được dùng lệnh này
  let isGroupAdmin = false;
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info.gridInfoMap[threadId];

    const isCreator = groupInfo.creatorId === userId;
    const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);

    isGroupAdmin = isCreator || isDeputy;
  } catch (err) {
    return api.sendMessage(
      "⚠️ Không thể lấy thông tin nhóm để kiểm tra quyền, vui lòng thử lại sau.",
      threadId,
      type
    );
  }

  const isBotAdmin = global.users?.admin?.includes(userId);

  if (!isGroupAdmin && !isBotAdmin) {
    return api.sendMessage(
      {
        msg: "🚫 Chỉ Trưởng nhóm hoặc Phó nhóm mới có thể sử dụng lệnh này.",
        ttl: 20000
      },
      threadId,
      type
    );
  }

  // Toggle chế độ box_only (chỉ Trưởng nhóm / Phó nhóm được dùng lệnh bot trong nhóm)
  const threadData = await Threads.getData(threadId);
  const currentValue = threadData.data.box_only || false;
  const newValue = !currentValue;

  threadData.data.box_only = newValue;
  await Threads.setData(threadId, threadData.data);

  return api.sendMessage(
    `✅ Đã ${newValue ? "bật" : "tắt"} chế độ chỉ Trưởng nhóm/Phó nhóm được dùng lệnh bot trong nhóm này.`,
    threadId,
    type
  );
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
