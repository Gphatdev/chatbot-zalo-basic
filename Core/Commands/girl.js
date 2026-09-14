/**
 * [PORT TỪ NKNP] girl.js
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
const fs = require('fs');
const path = require('path');

const girlImages = require('../../assets/girl.json');

const __legacyConfig = {
  name: 'girl',
  aliases: ['gai'],
  version: '1.0.3',
  role: 0,
  author: 'ShinTHL09',
  description: 'Xem ảnh gái ngẫu nhiên',
  category: 'Giải trí',
  usage: 'girl',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type } = event;
  const tempDir = path.join(__dirname, 'temp');
  const filePath = path.join(__dirname, 'temp', 'gai.jpg');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    const link = girlImages[Math.floor(Math.random() * girlImages.length)];

    const res = await axios.get(link, {
      responseType: "arraybuffer",
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://imgur.com/',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    fs.writeFileSync(filePath, res.data);

    await api.sendMessage({ msg: "📷 Ảnh gái ngẫu nhiên", attachments: filePath, ttl: 60000 }, threadId, type);

    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Đã xảy ra lỗi khi tải ảnh gái:", error.message);
    return api.sendMessage("❌ Không thể tải ảnh gái lúc này. Vui lòng thử lại sau.", threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
