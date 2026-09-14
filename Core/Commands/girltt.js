/**
 * [PORT TỪ NKNP] girltt.js
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

const __legacyConfig = {
  name: 'girltt',
  aliases: ['gaitt'],
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09, tnt',
  description: 'Xem video gái ngẫu nhiên trên tiktok',
  category: 'Giải trí',
  usage: 'girltt',
  cooldowns: 2
};
const __legacyRun = async ({ event, api }) => {
  const { threadId, type } = event;

  const tempDir = path.join(__dirname, 'temp');
  const filePath = path.join(tempDir, 'gaitiktok.mp4');

  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const data = await axios.get("https://gaitiktok.onrender.com/random?apikey=randomtnt");
    const { play, author, digg_count, comment_count, play_count, share_count, download_count, title, duration, region } = data.data.data;

    const res = await axios.get(play, {
      responseType: "arraybuffer",
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'video/*,*/*;q=0.8'
      }
    });

    const text =  `┣➤📺 Random gái tiktok\n┣➤🌐 Quốc gia: ${region}\n┣➤📝 Tiêu đề: ${title}\n┣➤🔍 Tên kênh: ${author.nickname}\n┣➤😽 ID người dùng: ${author.unique_id}\n┣➤❤ Lượt tim: ${digg_count}\n┣➤💬 Lượt bình luận: ${comment_count}\n┣➤👁‍🗨 Lượt xem: ${play_count}\n┣➤📎 Lượt share: ${share_count}\n┣➤👉 Lượt tải: ${download_count}\n┣➤⏰ Thời gian: ${duration} s`

    fs.writeFileSync(filePath, res.data);

    const videoData = await processVideo(filePath, threadId, type);

    await api.sendVideo({
      videoUrl: videoData.videoUrl,
      thumbnailUrl: videoData.thumbnailUrl,
      duration: videoData.metadata.duration,
      width: videoData.metadata.width,
      height: videoData.metadata.height,
      msg: text,
      ttl: 60000
    }, threadId, type);
  } catch (err) {
    console.error("Lỗi xử lý video:", err.message);
    await api.sendMessage("❌ Không thể tải video.", threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
