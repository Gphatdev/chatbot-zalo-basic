/**
 * [PORT TỪ NKNP] daily.js
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
  name: 'daily',
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09',
  description: 'Nhận thưởng mỗi ngày',
  category: 'Kiếm tiền',
  usage: 'daily',
  cooldowns: 2,
  rewardAmount: 10000, // số tiền thưởng mỗi ngày
  cooldownTime: 12 * 60 * 60 * 1000 // thời gian chờ: 12 giờ
};
const __legacyRun = async ({ event, api, Users }) => {
  const { data, threadId, type } = event;
  const { rewardAmount, cooldownTime } = __legacyConfig;
  const senderID = data.uidFrom;

  let userData = (await Users.getData(senderID)).data;

  const lastClaim = userData.dailyCoolDown || 0;
  const timePassed = Date.now() - lastClaim;

  if (timePassed < cooldownTime) {
    const timeLeft = cooldownTime - timePassed;
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
    const seconds = Math.floor((timeLeft / 1000) % 60);

    return api.sendMessage(
      `🕒 Bạn đã nhận rồi!\nVui lòng quay lại sau: ${hours} giờ ${minutes} phút ${seconds < 10 ? "0" : ""}${seconds} giây.`,
      threadId, type
    );
  }
  userData.money += rewardAmount;
  userData.dailyCoolDown = Date.now();
  await Users.setData(senderID, userData);

  console.log(userData);

  return api.sendMessage(
    `🎉 Bạn vừa nhận được ${rewardAmount.toLocaleString('vi-VN')}₫! Quay lại sau 12 giờ để nhận tiếp nhé.`,
    threadId, type
  );
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
