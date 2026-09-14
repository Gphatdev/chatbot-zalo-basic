/**
 * [PORT TỪ NKNP] gpt.js
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

const __legacyConfig = {
  name: 'gpt',
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09',
  description: 'Hỏi chatgpt',
  category: 'Tiện ích',
  usage: 'gpt <text>',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type } = event;

  if (!args[0]) {
    return api.sendMessage('Vui lòng nhập câu hỏi của bạn!', threadId, type);
  }

  try {
    const response = await axios.get('https://api.zeidteam.xyz/ai/chatgpt4?prompt=' + encodeURIComponent(args.join(' ')));

    const text = response.data.response;
    
    await api.sendMessage(text, threadId, type);

  } catch (error) {
    console.error('Lỗi khi gọi API GPT:', error.message || error);
    return api.sendMessage('Đã xảy ra lỗi khi kết nối với GPT. Vui lòng thử lại sau!', threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
