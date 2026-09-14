/**
 * [PORT TỪ NKNP] pay.js
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
  name: 'pay',
  version: '1.0.0',
  role: 0,
  author: 'NLam182',
  description: 'Chuyển tiền cho người khác',
  category: 'Tiện ích',
  usage: 'pay [@tag] [số tiền]',
  cooldowns: 3,
  dependencies: {}
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type, data } = event;

  const mentions = data.mentions;
  const hasMention = mentions && mentions.length > 0;
  const senderID = data.uidFrom;

  if (!hasMention) {
    return api.sendMessage("❌ Vui lòng tag người nhận tiền.\nCú pháp: pay @người_nhận [số tiền]", threadId, type);
  }

  const receiverID = mentions[0].uid;

  if (senderID === receiverID) {
    return api.sendMessage("❌ Bạn không thể chuyển tiền cho chính mình.", threadId, type);
  }

  let amountArg = null;
  for (let i = args.length - 1; i >= 1; i--) {
    if (!isNaN(args[i]) && args[i] !== '' && parseFloat(args[i]) > 0) {
      amountArg = args[i];
      break;
    }
  }

  if (!amountArg || isNaN(amountArg)) {
    return api.sendMessage("❌ Số tiền chưa hợp lệ.\nCú pháp: pay @người_nhận [số tiền]", threadId, type);
  }

  const amount = parseFloat(amountArg);

  if (amount <= 0) {
    return api.sendMessage("❌ Số tiền phải lớn hơn 0.", threadId, type);
  }

  if (!Number.isInteger(amount)) {
    return api.sendMessage("❌ Số tiền phải là số nguyên.", threadId, type);
  }

  const MAX_MONEY = 999999999999;
  if (amount > MAX_MONEY) {
    return api.sendMessage(`❌ Số tiền không được vượt quá ${MAX_MONEY.toLocaleString('vi-VN')}₫!`, threadId, type);
  }

  if (amount < 1) {
    return api.sendMessage("❌ Số tiền tối thiểu là 1₫!", threadId, type);
  }

  const finalAmount = Math.floor(amount);

  try {

    const senderDataResult = await Users.getData(senderID);
    const senderData = senderDataResult.data;

    const now = Date.now();
    const lastPayTime = senderData.lastPayTime || 0;
    const PAY_COOLDOWN = 5000; 

    if (now - lastPayTime < PAY_COOLDOWN) {
      const remainingTime = Math.ceil((PAY_COOLDOWN - (now - lastPayTime)) / 1000);
      return api.sendMessage(`⏳ Vui lòng chờ thêm ${remainingTime} giây trước khi thực hiện giao dịch tiếp theo.`, threadId, type);
    }

    const senderMoney = senderData.money || 0;

    if (typeof senderMoney !== 'number' || senderMoney < 0) {
      return api.sendMessage("❌ Dữ liệu tài khoản của bạn đang gặp vấn đề. Vui lòng liên hệ quản trị viên.", threadId, type);
    }

    if (senderMoney < finalAmount) {
      return api.sendMessage(
        `❌ Số dư hiện tại không đủ để thực hiện giao dịch.\n💰 Số dư: ${senderMoney.toLocaleString('vi-VN')}₫\n💸 Số tiền cần chuyển: ${finalAmount.toLocaleString('vi-VN')}₫`,
        threadId,
        type
      );
    }

    const maxTransfer = Math.floor(senderMoney * 0.9);
    if (finalAmount > maxTransfer && senderMoney > 10000) {
      return api.sendMessage(
        `❌ Để an toàn, bạn chỉ có thể chuyển tối đa 90% số dư!\n💰 Số tiền tối đa có thể chuyển: ${maxTransfer.toLocaleString('vi-VN')}₫`,
        threadId,
        type
      );
    }

    const receiverDataResult = await Users.getData(receiverID);
    const receiverData = receiverDataResult.data;
    const receiverMoney = receiverData.money || 0;

    if (typeof receiverMoney !== 'number' || receiverMoney < 0) {
      return api.sendMessage("❌ Dữ liệu tài khoản người nhận bị lỗi!", threadId, type);
    }

    if (receiverMoney + finalAmount > MAX_MONEY) {
      return api.sendMessage(
        `❌ Người nhận sẽ vượt quá giới hạn tiền tối đa!\n💰 Số dư hiện tại của người nhận: ${receiverMoney.toLocaleString('vi-VN')}₫\n💸 Giới hạn tối đa: ${MAX_MONEY.toLocaleString('vi-VN')}₫`,
        threadId,
        type
      );
    }

    let receiverName = "Người được tag";
    try {
      const receiverInfo = await api.getUserInfo(receiverID);
      receiverName = receiverInfo?.changed_profiles?.[receiverID]?.displayName || "Người được tag";
    } catch {
      receiverName = "Người được tag";
    }

    let senderName = "Bạn";
    try {
      const senderInfo = await api.getUserInfo(senderID);
      senderName = senderInfo?.changed_profiles?.[senderID]?.displayName || "Bạn";
    } catch {
      senderName = "Bạn";
    }

    const newSenderMoney = senderMoney - finalAmount;
    const newReceiverMoney = receiverMoney + finalAmount;

    if (newSenderMoney < 0) {
      return api.sendMessage("❌ Lỗi tính toán! Giao dịch bị hủy.", threadId, type);
    }

    if (newReceiverMoney > MAX_MONEY) {
      return api.sendMessage("❌ Lỗi tính toán! Giao dịch bị hủy.", threadId, type);
    }

    senderData.money = newSenderMoney;
    senderData.lastPayTime = now;
    receiverData.money = newReceiverMoney;

    try {
      await Users.setData(senderID, senderData);
      await Users.setData(receiverID, receiverData);
    } catch (saveError) {
      console.error("Error saving transaction data:", saveError);
      return api.sendMessage("❌ Lỗi lưu dữ liệu! Giao dịch có thể không thành công. Vui lòng kiểm tra lại số dư.", threadId, type);
    }

    return api.sendMessage(
      `✅ Chuyển tiền thành công!\n💸 Đã chuyển ${finalAmount.toLocaleString('vi-VN')}₫ cho ${receiverName}\n💰 Số dư của bạn: ${newSenderMoney.toLocaleString('vi-VN')}₫`,
      threadId,
      type
    );

  } catch (err) {
    console.error("Error in pay command:", err);
    return api.sendMessage(
      "❌ Không thể thực hiện giao dịch. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
