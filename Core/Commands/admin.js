/**
 * [PORT TỪ NKNP] admin.js
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

const { updateConfigArray, reloadConfig } = require("../../Utils/LegacyUtils.cjs");

const __legacyConfig = {
  name: 'admin',
  version: '1.1.0',
  role: 2,
  author: 'ShinTHL09',
  description: 'Quản lý admin và support của bot bằng ID hoặc tag.',
  category: 'Hệ thống',
  usage: 'admin <add|rm|sp|rmsp|list> [@tag/ID] (có thể tag nhiều người, nhập nhiều uid cách nhau dấu cách hoặc ,)',
  cooldowns: 2
};
const __legacyRun = async ({ args, event, api, Threads }) => {
  const action = args[0]?.toLowerCase();
  const { threadId, type, data } = event;

  let targetIds = [];

  if (data.mentions && Object.keys(data.mentions).length > 0) {
    targetIds = Object.values(data.mentions).map(m => m.uid);
  }

  if (targetIds.length === 0 && args.length > 1) {
    targetIds = args.slice(1)
      .join(" ")            
      .split(/[\s,]+/)      
      .filter(id => id && !isNaN(id));
  }

  const processAdd = async (listName, label) => {
    if (targetIds.length === 0) return api.sendMessage(`Vui lòng nhập ID hoặc tag người dùng cần thêm vào danh sách ${label}.`, threadId, type);

    const currentList = global.users[listName];
    const newIds = targetIds.filter(id => !currentList.includes(id));
    if (newIds.length === 0) return api.sendMessage("Không có người dùng mới nào để thêm.", threadId, type);

    const updated = [...currentList, ...newIds];
    await updateConfigArray(`${listName}_bot`, updated);
    await reloadConfig();

    const infos = await Promise.all(newIds.map(id => api.getUserInfo(id).catch(() => null)));
    const names = infos.map((info, i) => `${info?.changed_profiles?.[newIds[i]]?.displayName || "Không rõ"} - ${newIds[i]}`);

    return api.sendMessage(`✅ Đã thêm ${label} thành công:\n` + names.join("\n"), threadId, type);
  };

  const processRemove = async (listName, label) => {
    if (targetIds.length === 0) return api.sendMessage(`Vui lòng nhập ID hoặc tag người dùng cần gỡ khỏi danh sách ${label}.`, threadId, type);

    const currentList = global.users[listName];
    const existing = targetIds.filter(id => currentList.includes(id));
    if (existing.length === 0) return api.sendMessage("Không tìm thấy người dùng phù hợp trong danh sách hiện tại.", threadId, type);

    const updated = currentList.filter(id => !existing.includes(id));
    await updateConfigArray(`${listName}_bot`, updated);
    await reloadConfig();

    const infos = await Promise.all(existing.map(id => api.getUserInfo(id).catch(() => null)));
    const names = infos.map((info, i) => `${info?.changed_profiles?.[existing[i]]?.displayName || "Không rõ"} - ${existing[i]}`);

    return api.sendMessage(`✅ Đã gỡ ${label} thành công:\n` + names.join("\n"), threadId, type);
  };

  switch (action) {
    case "add":
      return processAdd("admin", "admin bot");
    case "rm":
      return processRemove("admin", "admin bot");
    case "sp":
      return processAdd("support", "support bot");
    case "rmsp":
      return processRemove("support", "support bot");

    case "list": {
      const adminList = global.users.admin || [];
      const supportList = global.users.support || [];

      const adminInfos = await Promise.all(adminList.map(id => api.getUserInfo(id).catch(() => null)));
      const supportInfos = await Promise.all(supportList.map(id => api.getUserInfo(id).catch(() => null)));

      let msg = "--- DANH SÁCH QUẢN TRỊ ---\n\n";

      msg += "👑 Admin Bot:\n";
      msg += adminInfos.length > 0
        ? adminInfos.map((info, i) => {
            const uid = adminList[i];
            const name = info?.changed_profiles?.[uid]?.displayName || "(Không rõ)";
            return ` - ${name} - ${uid}`;
          }).join("\n")
        : "Không có admin nào.";

      msg += "\n\n🛠️ Support Bot:\n";
      msg += supportInfos.length > 0
        ? supportInfos.map((info, i) => {
            const uid = supportList[i];
            const name = info?.changed_profiles?.[uid]?.displayName || "(Không rõ)";
            return ` - ${name} - ${uid}`;
          }).join("\n")
        : "Không có support nào.";

      return api.sendMessage(msg, threadId, type);
    }
  case "adminonly":
  case "supportonly":
  case "boxonly": {
    const keyMap = {
      adminonly: "admin_only",
      supportonly: "support_only",
      boxonly: "box_only"
    };

    const key = keyMap[action.toLowerCase()];

    const threadData = await Threads.getData(threadId);
    const currentValue = threadData.data[key] || false;

    const newValue = !currentValue;
    threadData.data[key] = newValue;
    Threads.setData(threadId, threadData.data);

    return api.sendMessage(
      `✅ Đã ${newValue ? "bật" : "tắt"} chế độ ${key.replace("_", " ")}.`,
      threadId,
      type
    );
  }


    default:
      return api.sendMessage(
        "Quản lý admin bot\n\n" +
        "admin add [@tag/ID...] - Thêm admin\n" +
        "admin rm [@tag/ID...] - Gỡ admin\n" +
        "admin sp [@tag/ID...] - Thêm support\n" +
        "admin rmsp [@tag/ID...] - Gỡ support\n" +
        "admin list - Xem danh sách\n\n" +
        "admin adminonly - Bật tắt chế độ chỉ admin được dùng bot\n" +
        "admin supportonly - Bật tắt chế độ chỉ support được dùng bot\n" +
        "admin boxonly - Bật tắt chế độ chỉ cho phép trong nhóm",
        threadId, type
      );
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
