/**
 * [PORT TỪ NKNP] setmoney.js
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


const __legacyConfig = {
  name: 'setmoney',
  version: '1.0.1',
  role: 2,
  author: 'ShinTHL09',
  description: 'Thêm hoặc đặt số tiền của bản thân hoặc người khác',
  category: 'Tiện ích',
  usage: 'setmoney [set/add/take] [@tag] [số tiền]',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type, data } = event;

  const subcommand = (args[0] || '').toLowerCase();
  const mentions = data.mentions;
  const hasMention = mentions && mentions.length > 0;
  const senderID = data.uidFrom;

  const targetID = hasMention ? mentions[0].uid : senderID;
  let targetName = "Bạn";

  if (hasMention) {
    try {
      const info = await api.getUserInfo(targetID);
      targetName = info?.changed_profiles?.[targetID]?.displayName || "Người được tag";
    } catch (err) {
      targetName = "Người được tag";
    }
  }

  try {
    const userDataResult = await Users.getData(targetID);
    const userData = userDataResult.data;

    switch (subcommand) {
      case 'set': {
        let amountArg = null;
        for (let i = args.length - 1; i >= 1; i--) {
          if (!isNaN(args[i]) && args[i] !== '') {
            amountArg = args[i];
            break;
          }
        }
        if (!amountArg || isNaN(amountArg)) {
          return api.sendMessage("❌ Dùng: setmoney set [@tag] [số tiền]", threadId, type);
        }
        userData.money = parseInt(amountArg);
        await Users.setData(targetID, userData);
        return api.sendMessage(
          `✅ Đã đặt lại số tiền của ${targetName} thành ${userData.money.toLocaleString('vi-VN')}₫`,
          threadId,
          type
        );
      }

      case 'add': {

        let amountArg = null;
        for (let i = args.length - 1; i >= 1; i--) {
          if (!isNaN(args[i]) && args[i] !== '') {
            amountArg = args[i];
            break;
          }
        }
        if (!amountArg || isNaN(amountArg)) {
          return api.sendMessage("❌ Dùng: setmoney add [@tag] [số tiền]", threadId, type);
        }
        const amountToAdd = parseInt(amountArg);
        userData.money += amountToAdd;
        await Users.setData(targetID, userData);
        return api.sendMessage(
          `✅ Đã cộng thêm ${amountToAdd.toLocaleString('vi-VN')}₫ cho ${targetName}\n💰 Tổng cộng: ${userData.money.toLocaleString('vi-VN')}₫`,
          threadId,
          type
        );
      }

      case 'take': {

        let amountArg = null;
        for (let i = args.length - 1; i >= 1; i--) {
          if (!isNaN(args[i]) && args[i] !== '') {
            amountArg = args[i];
            break;
          }
        }
        if (!amountArg || isNaN(amountArg)) {
          return api.sendMessage("❌ Dùng: setmoney take [@tag] [số tiền]", threadId, type);
        }
        const amountToTake = parseInt(amountArg);
        userData.money -= amountToTake;
        await Users.setData(targetID, userData);
        return api.sendMessage(
          `✅ Đã lấy ${amountToTake.toLocaleString('vi-VN')}₫ của ${targetName}\n💰 Tổng cộng: ${userData.money.toLocaleString('vi-VN')}₫`,
          threadId,
          type
        );
      }

      default:
        return api.sendMessage("❌ Lệnh không hợp lệ. Dùng: setmoney set/add/take [@tag] [số tiền]", threadId, type);
    }
  } catch (err) {
    console.error(err);
    return api.sendMessage(
      "❌ Không thể xử lý yêu cầu. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
