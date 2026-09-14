/**
 * [PORT TỪ NKNP] taixiu.js
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

const fs = require("fs");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");



const diceDir = path.join(__dirname, "cache", "taixiu");
const diceURLs = {
  1: "https://i.postimg.cc/QdpW76h1/dice-1.jpg",
  2: "https://i.postimg.cc/pX5jWWS0/dice-2.jpg",
  3: "https://i.postimg.cc/5tbQSw2G/dice-3.jpg",
  4: "https://i.postimg.cc/Fz8Jy8Yg/dice-4.jpg",
  5: "https://i.postimg.cc/MpkQvk2z/dice-5.jpg",
  6: "https://i.postimg.cc/T24mvLtL/dice-6.jpg"
};

async function ensureDiceImagesExist() {
  if (!fs.existsSync(diceDir)) fs.mkdirSync(diceDir, { recursive: true });
  for (let i = 1; i <= 6; i++) {
    const filePath = path.join(diceDir, `dice_${i}.jpg`);
    if (!fs.existsSync(filePath)) {
      const res = await axios.get(diceURLs[i], {
        responseType: "arraybuffer",
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://imgur.com/',
            'Accept': 'image/*,*/*;q=0.8'
          }
      });
      fs.writeFileSync(filePath, res.data);
    }
  }
}

const __legacyConfig = {
  name: "taixiu",
  version: "1.0.5",
  role: 0,
  author: "ShinTHL09",
  description: "Game tài xỉu có cược tiền hoặc allin",
  category: "game",
  usage: "taixiu <tai/xiu> <số tiền/allin>",
  cooldowns: 10,
  dependencies: {
    "jimp": "0.16.1"
  }
};
const __legacyRun = async ({ args, event, api, Users }) => {
  const { threadId, type, data } = event;
  const uid = data.uidFrom;
  const send = (msg) => api.sendMessage({ msg }, threadId, type);

  const choice = args[0]?.toLowerCase();
  if (!["tai", "xiu"].includes(choice))
    return send("⚠️ Bạn cần chọn `tai` hoặc `xiu`");

  const betInput = args[1];
  if (!betInput) return send("⚠️ Bạn chưa nhập số tiền cược!");
  const userData = (await Users.getData(uid)).data;
  const money = userData.money;
  let betAmount = 0;

  if (betInput === "allin") {
    if (money <= 0) return send("❌ Bạn không còn tiền để allin!");
    betAmount = money;
  } else {
    betAmount = parseInt(betInput);
    if (isNaN(betAmount) || betAmount <= 0)
      return send("❌ Số tiền cược không hợp lệ!");
    if (betAmount < 1000)
      return send("❌ Số tiền cược tối thiểu là 1000!");
    if (betAmount > money)
      return send(`❌ Bạn chỉ có ${money} xu!`);
  }

  const dice = [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
  const total = dice.reduce((a, b) => a + b, 0);
  const result = total >= 11 ? "tai" : "xiu";

  await api.sendMessage({ msg: "🎲 Đang lắc xúc xắc...", ttl: 3000 }, threadId, type);
  setTimeout(async () => {
    const diceImages = await Promise.all(
      dice.map(num => Jimp.read(path.join(diceDir, `dice_${num}.jpg`)))
    );

    const width = diceImages.reduce((sum, img) => sum + img.bitmap.width, 0);
    const height = diceImages[0].bitmap.height;
    const compositeImage = new Jimp(width, height);

    let x = 0;
    for (const img of diceImages) {
      compositeImage.composite(img, x, 0);
      x += img.bitmap.width;
    }

    const finalImagePath = path.join(diceDir, "result.jpg");
    await compositeImage.writeAsync(finalImagePath);

    let message = `🎲 Xúc xắc: ${dice.join(" + ")} = ${total}\n` +
      `✅ Kết quả: ${result.toUpperCase()}\n` +
      `📌 Bạn chọn: ${choice.toUpperCase()}\n`;

    if (choice === result) {
      const taxRate = 0.1; // 10% thuế
      const winnings = betAmount;
      const tax = Math.floor(winnings * taxRate);
      const taxed = winnings - tax;

      userData.money += taxed;
      await Users.setData(uid, userData);

      message += `🎉 Bạn thắng! +${taxed.toLocaleString()}₫ (bị trừ thuế ${tax.toLocaleString()}₫)\n💰 Số dư: ${userData.money.toLocaleString()}₫`;
    } else {
      userData.money -= betAmount;
      await Users.setData(uid, userData);

      message += `💥 Bạn thua! -${betAmount.toLocaleString()}₫\n💰 Số dư: ${userData.money.toLocaleString()}₫`;
    }

    api.sendMessage({ msg: message, attachments: finalImagePath, ttl: 15000 }, threadId, type);
  }, 5000);
};
const __legacyOnLoad = async () => {
  await ensureDiceImagesExist();
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, __legacyOnLoad, undefined, undefined);
