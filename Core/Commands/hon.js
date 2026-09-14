/**
 * [PORT TỪ NKNP] hon.js
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

const path = require("path");
const fs = require("fs");
const axios = require("axios");

const __legacyConfig = {
  name: 'hon',
  aliases: ['kiss', 'hôn'],
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09', // ý tưởng từ Raiden Makoto
  description: 'Hôn người bạn tag',
  category: 'Hành động',
  usage: 'hôn [@tag]',
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async ({ event, api }) => {
    const { threadId, type, data } = event;

    var link = [    
"https://i.imgur.com/0rKeVFp.gif",
"https://i.imgur.com/V4JnRiq.gif"
   ];

    const mentions = data.mentions;
    const hasMention = mentions && mentions.length > 0;

    if (!hasMention) {
        return api.sendMessage("❌ Bạn cần tag người muốn hôn!", threadId, type);
    }

    const receiverID = mentions[0].uid;

    const info = await api.getUserInfo(receiverID);
    const user = info.changed_profiles[receiverID];
    
    const name = user.displayName;

    const tempPath = path.join(__dirname, 'temp');
    const honPath = path.join(tempPath, 'hon.gif');
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
    }
    const randomLink = link[Math.floor(Math.random() * link.length)];

    const response = await axios.get(randomLink, { 
        responseType: 'arraybuffer', 
        headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://imgur.com/',
        'Accept': 'image/*,*/*;q=0.8'
      } });
    fs.writeFileSync(honPath, response.data);

    const msg =  `${name} 𝗕𝗮𝗲 𝗰𝗵𝗼 𝗮𝗻𝗵 𝘁𝗵𝗼̛𝗺 𝗺𝗼̣̂𝘁 𝗰𝗮́𝗶 𝗻𝗲̀ 💞`

    await api.sendMessage({ msg, attachments: honPath, mentions: [{ uid: receiverID, pos: msg.indexOf(name), len: name.length }] }, threadId, type);

    fs.unlinkSync(honPath);

};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
