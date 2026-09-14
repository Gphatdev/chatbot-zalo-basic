/**
 * [PORT TỪ NKNP] qrheart.js
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

const axios = require('axios');
const fs = require("fs");
const path = require('path');

const __legacyConfig = {
  name: 'qrheart',
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09',
  description: 'Tạo mã QR trái tim từ văn bản',
  category: 'Tiện ích',
  usage: 'qrcode <nội dung> - <chữ mô tả>',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ api, event, args }) => {
  const { threadId, type } = event;

  const input = args.join(' ').split('-');
  const text = input[0]?.trim();
  const caption = input[1]?.trim();

  if (!text) {
    return api.sendMessage('❌ Vui lòng nhập nội dung cần tạo mã QR.\n\nCú pháp: qrheart <nội dung> - <caption>', threadId, type);
  }

  try {
    const url = `https://api.zeidteam.xyz/image-generator/qrcode-heart?text=${encodeURIComponent(text)}&caption=${encodeURIComponent(caption)}`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });

    const filePath = path.join(__dirname, 'temp', `qrcode-heart_${Date.now()}.png`);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(filePath, res.data);

    await api.sendMessage({
      msg: `💖 Mã QR trái tim của bạn đã được tạo:`,
      attachments: filePath
    }, threadId, type);
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(error);
    api.sendMessage('❌ Không thể tạo mã QR lúc này. Vui lòng thử lại sau.', threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
