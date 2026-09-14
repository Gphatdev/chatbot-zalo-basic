/**
 * [PORT TỪ NKNP] itik.js
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

const axios = require("axios");
const fs = require("fs");

const __legacyConfig = {
  name: "itik",
  version: "1.0.0",
  role: 0,
  author: "NLam182 (Zeid_Team)",
  description: "Xem thông tin của acc tiktok qua username",
  category: "Tiện ích",
  usage: "itik <username>",
  cooldowns: 2,
  dependencies: {}
};
const __legacyRun = async function({ args, event, api, Users }) {
  const { threadId, type } = event;

  if (!args[0]) {
    return api.sendMessage('Vui lòng nhập username để lấy thông tin.', threadId, type);
  }

  const username = args[0];

  try {
    const apiUrl = `https://api.zeidteam.xyz/tiktok/user-info?username=@${username}`;

    const response = await axios.get(apiUrl);

    if (response.data && response.data.code === 0) {
      const ud = response.data.data.user;
      const st = response.data.data.stats;

      let userInfo = `╭───────────⭓\n• 𝐓𝐈𝐊𝐓𝐎𝐊 - 𝐈𝐧𝐟𝐨 \n├────⭔\n│ » Lấy thông tin của người dùng trên tiktok.\n`;

      userInfo += `├────────⭔\n`;
      
      userInfo += `│ » Tên tài khoản: ${ud.nickname}\n`;
      userInfo += `│ » Username: ${ud.uniqueId}\n`;
      userInfo += `│ » ID: ${ud.id}\n`;
        if (ud.signature) {
        userInfo += `│ » Tiểu sử:\n`;
        const signatureLines = ud.signature.split("\n");
        signatureLines.forEach((line) => {
          userInfo += `│ ${line}\n`;
        });
      }

      userInfo += `│ » Tick xanh: ${ud.verified ? '✅' : '❎'}\n`;
      userInfo += `│ » Mối quan hệ: ${ud.relation}\n`;
      userInfo += `│ » Trạng thái: ${ud.verified ? 'Công khai' : 'Riêng tư'}\n`;
      userInfo += `│ » Dưới 18t: ${ud.isUnderAge18 ? '✅' : '❎'}\n`;

      if (ud.ins_id) {
        userInfo += `│ » Ins ID: ${ud.ins_id}\n`;
      }

      if (ud.twitter_id) {
        userInfo += `│ » Tw ID: ${ud.twitter_id}\n`;
      }

      if (ud.youtube_channel_title) {
        userInfo += `│ » Youtube: ${ud.youtube_channel_title}\n`;
      }
      userInfo += `├────────⭔\n`;
      userInfo += `│ » Người theo dõi: ${st.followerCount}\n`;
      userInfo += `│ » Đang theo dõi: ${st.followingCount}\n`;
      userInfo += `│ » Số tim: ${st.heartCount}\n`;
      userInfo += `│ » Số video: ${st.videoCount}\n╰───────────⭓`;

      
      const imageUrl = ud.avatarMedium;
      const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const imageData = Buffer.from(imageResponse.data, "binary");

      const imageFileName = "avatarmedium.jpg"; 
      fs.writeFileSync(imageFileName, imageData);
      
      
      api.sendMessage({
        msg: userInfo,
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(() => {
        try {
          fs.unlinkSync(imageFileName);
        } catch (e) {
          console.log('File đã được xóa hoặc không tồn tại');
        }
      }, 3000);
    } else if (response.data && response.data.code === -1) {
      api.sendMessage('Không tìm thấy thông tin người dùng.', threadId, type);
    } else {
      api.sendMessage('Không tìm thấy thông tin người dùng.', threadId, type);
    }
  } catch (error) {
    console.error(error);
    api.sendMessage('Có lỗi xảy ra khi lấy thông tin từ TikTok.', threadId, type);
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
