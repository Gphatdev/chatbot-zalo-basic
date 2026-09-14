/**
 * [PORT TỪ NKNP] vdgirl.js
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
const { processVideo } = require("../../Utils/LegacyUtils.cjs");

const vdgirl = require('../../assets/vdgirl.json');

const __legacyConfig = {
  name: 'vdgirl',
  aliases: ['vdgai'],
  version: '1.0.2',
  role: 0,
  author: 'ShinTHL09',
  description: 'Xem video gái ngẫu nhiên',
  category: 'Giải trí',
  usage: 'vdgirl',
  cooldowns: 2
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type } = event;

  const tempDir = path.join(__dirname, 'temp');
  const filePath = path.join(tempDir, 'gai.mp4');

  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const link = vdgirl[Math.floor(Math.random() * vdgirl.length)];

    const res = await axios.get(link, {
      responseType: "arraybuffer",
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://imgur.com/',
        'Accept': 'video/*,*/*;q=0.8'
      }
    });

    fs.writeFileSync(filePath, res.data);

    const videoData = await processVideo(filePath, threadId, type);

    await api.sendVideo({
      videoUrl: videoData.videoUrl,
      thumbnailUrl: videoData.thumbnailUrl,
      duration: videoData.metadata.duration,
      width: videoData.metadata.width,
      height: videoData.metadata.height,
      msg: "🎥 Video gái ngẫu nhiên",
      ttl: 60000
    }, threadId, type);
  } catch (err) {
    console.error("Lỗi xử lý video:", err.message);
    await api.sendMessage("❌ Không thể tải video.", threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
