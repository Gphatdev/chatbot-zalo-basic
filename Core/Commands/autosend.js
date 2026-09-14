/**
 * [PORT TỪ NKNP] autosend.js
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

const fs = require('fs');
const axios = require('axios');
const { ThreadType } = require("zca-js");

const autosendgif = require('../../assets/autosend.json');



// Danh sách thời gian và nội dung tự động gửi
const setting = [
  {
    timer: '06:00:00 AM',
    message: [
      'Chúc mọi người buổi sáng vui vẻ😉',
      'Buổi sáng đầy năng lượng nhaa các bạn😙',
      'Dậy đi học và đi làm nào mọi người ơi😁',
      'Dậy sớm thành công rồi đó, cố lên nhé!💪'
    ]
  },
  {
    timer: '08:00:00 AM',
    message: [
      'Dậy đê ngủ như heo😒',
      'Tính nướng tới bao giờ đây😠',
      'Ai chưa dậy thì lỡ giờ học giờ làm ráng chịu đó nha🤨'
    ]
  },
  {
    timer: '11:30:00 AM',
    message: [
      'Chúc mọi người buổi trưa vui vẻ😋',
      'Cả sáng mệt mỏi rùi nghỉ ngơi nạp năng lượng nào!!😴',
      'Đến giờ ăn trưa rồi nè, đừng bỏ bữa nhé🍱'
    ]
  },
  {
    timer: '01:00:00 PM',
    message: [
      'Chúc mọi người buổi chiều vui vẻ🙌',
      'Chúc mọi người buổi chiều đầy năng lượng😼',
      'Nghỉ trưa xíu rồi bắt đầu buổi chiều nha😇'
    ]
  },
  {
    timer: '05:00:00 PM',
    message: [
      'Hết giờ làm rồi về nhà thôi mọi người 😎',
      'Chiều rồi, xả stress thôi nào 🎉',
      'Đi làm hay đi học về nhớ tắm rửa ăn uống nha 🚿🍚'
    ]
  },
  {
    timer: '07:16:00 PM',
    message: [
      'Tối rồi, nghỉ ngơi đi mọi người 🥱',
      'Tối nay có ai rảnh đi chơi hông nè? 😜',
      'Nhớ ăn tối đầy đủ nhé, giữ sức khỏe 💪'
    ]
  },
  {
    timer: '10:00:00 PM',
    message: [
      'Khuya ròi ngủ đuy😴',
      'Tới giờ lên giường ngủ rùi😇',
      'Ngủ sớm cho da đẹp dáng xinh nha💤'
    ]
  },
  {
    timer: '11:00:00 PM',
    message: [
      'Chúc mọi người ngủ ngon😴',
      'Khuya rùi ngủ ngon nhé các bạn😇',
      'Tắt điện thoại và đi ngủ thôi 📴🛌'
    ]
  },
  {
    timer: '12:00:00 AM',
    message: [
      'Bây giờ bot sẽ ngủ😗',
      'Bot ngủ đây tạm biệt mọi người😘',
      'Chúc ai còn thức một đêm an yên nhé🌙'
    ]
  }
];

const form = `➢𝐍𝐨𝐭𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧🏆
➝ Bây Giờ Là: %time_now
➝ Đây Là Tin Nhắn Tự Động
━━━━━━━━━━━
[ 𝗡𝗢̣̂𝗜 𝗗𝗨𝗡𝗚 ]  %content`;

const __legacyConfig = {
  name: 'autosend',
  version: '1.0.1',
  role: 1,
  author: 'ShinTHL09',
  description: 'Tự động gửi tin nhắn theo giờ đã cài và tự xóa sau 5 phút',
  category: "Tiện ích",
  usage: 'autosend',
  cooldowns: 2
};
const __legacyRun = async ({ api, event, args, Threads }) => {
  const { threadId, type } = event;

  if (type === ThreadType.User) return api.sendMessage("❌ Lệnh chỉ có thể dùng trong nhóm", threadId, type);

  async function setAutoSend(id, status) {
    const thread = await Threads.getData(id);
    const data = thread.data;
    data.auto_send = status;
    await Threads.setData(id, data);
    return { id, status };
  }

  async function toggleAutoSend(id) {
    const thread = await Threads.getData(id);
    const data = thread.data;
    data.auto_send = !data.auto_send;
    await Threads.setData(id, data);
    return { id, status: data.auto_send };
  }

  if (args[0] === "all") {
    const mode = args[1];
    if (mode !== "on" && mode !== "off") {
      return api.sendMessage(
        `❌ Vui lòng dùng đúng cú pháp: autosend all [on|off]`,
        threadId, type
      );
    }

    const statusToSet = mode === "on";
    const allGroups = await api.getAllGroups();
    const allBoxIDs = Object.keys(allGroups.gridVerMap);
    const results = [];

    for (const boxId of allBoxIDs) {
      const result = await setAutoSend(boxId, statusToSet);
      results.push(result);
    }

    return api.sendMessage(
      `✅ Đã ${statusToSet ? "bật" : "tắt"} autosend cho ${results.length} nhóm.`,
      threadId, type
    );
  }

  const result = await toggleAutoSend(threadId);
  return api.sendMessage(
    `📩 Autosend đã được ${result.status ? "bật ✅" : "tắt ❌"} cho nhóm này.`,
    threadId, type
  );
};
const __legacyOnLoad = async function ({ api, Threads }) {
  const path = __dirname + '/temp/';

  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });

  setInterval(autosend, 1000);

  async function autosend() {
    const now = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const matched = setting.find(item => item.timer === now);
    if (!matched) return;

    const randomMessage = matched.message[Math.floor(Math.random() * matched.message.length)];
    const msg = form
      .replace(/%time_now/g, matched.timer)
      .replace(/%content/g, randomMessage);

    const fileName = `autosend.gif`;
    const filePath = path + fileName;

    try {
      const imageUrl = autosendgif[Math.floor(Math.random() * autosendgif.length)];

      const res = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://imgur.com/',
          'Accept': 'image/*,*/*;q=0.8'
        }
      });
      fs.writeFileSync(filePath, res.data);

    } catch (err) {
      console.error("Lỗi tải hoặc lưu ảnh:", err.message);
    }


    const allGroups = await api.getAllGroups();
    const allBoxIDs = Object.keys(allGroups.gridVerMap);

    for (const Group of allBoxIDs) {
      const Thread = await Threads.getData(Group);
      if (Thread.data.auto_send) {
        try {
          await api.sendMessage({
            msg: msg,
            attachments: filePath,
            ttl: 300000
          }, Thread.threadId, ThreadType.Group);
        } catch (err) {
          console.log(`Không gửi được tới threadId ${Thread.threadId}`);
          continue;
        }
      }
    }

    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Lỗi khi xóa file:', err);
    }
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, __legacyOnLoad, undefined, undefined);
