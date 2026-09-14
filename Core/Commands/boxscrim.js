
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import moment from "moment-timezone";
import { fileURLToPath } from "url";
import { registerFont } from "canvas";
import { ThreadType } from "zca-js";

// Gọi 2 module vẽ ảnh trong thư mục Core/Commands/boxscrim
import createLuffyImage from "./boxscrim/canvas_luffy.js";
import createItachiImage from "./boxscrim/canvas_itachi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CẤU HÌNH TÊN FILE ẢNH NỀN ---
const ITACHI_BG_FILENAME = "background_itachi.png";
const LUFFY_BG_FILENAME = "background_luffy.png";

// --- ĐƯỜNG DẪN DÙNG CHUNG VỚI HỆ THỐNG LUOTDUNG ---
const LUOTDUNG_DATA_DIR = path.join(__dirname, "data", "Luotdung");
const PATHS = {
  DATA: path.join(LUOTDUNG_DATA_DIR, "bank_user_turns.json"),
  VOHAN: path.join(LUOTDUNG_DATA_DIR, "tinhdiem_vohan.json"),
  VOHAN_BOX: path.join(LUOTDUNG_DATA_DIR, "vohan_box.json"),
};

let isAssetsReady = false;

// --- TIỆN ÍCH ĐỌC/GHI DỮ LIỆU CỦA LUOTDUNG ---
function loadData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeJsonSync(filePath, {});
      return {};
    }
    return fs.readJsonSync(filePath);
  } catch {
    return {};
  }
}

function saveData(filePath, data) {
  try {
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeJsonSync(filePath, data, { spaces: 2 });
  } catch (e) {
    console.error("[boxscrim] Lỗi lưu dữ liệu luotdung:", e.message);
  }
}

// --- KIỂM TRA TRẠNG THÁI VÔ HẠN BOX ---
function checkVohanBox(threadId) {
  const boxData = loadData(PATHS.VOHAN_BOX);
  const entry = boxData[String(threadId)];
  if (!entry || !entry.expiry) return false;
  if (entry.expiry === "permanent") return true;
  const exp = moment(entry.expiry);
  return exp.isValid() && moment().isAfter(exp) === false;
}

function checkPersonalVohan(uid) {
  const vohanData = loadData(PATHS.VOHAN);
  const expiry = vohanData[String(uid)];
  if (!expiry) return false;
  if (moment().isBefore(moment(expiry))) return true;
  delete vohanData[String(uid)];
  saveData(PATHS.VOHAN, vohanData);
  return false;
}

// --- XỬ LÝ LƯỢT DÙNG (CÁ NHÂN / VÔ HẠN) ---
function handleUserTurns(uid, threadId) {
  if (checkVohanBox(threadId)) {
    return { status: true, isFree: true, remaining: "Vô Hạn (Box)" };
  }

  if (checkPersonalVohan(uid)) {
    return { status: true, isFree: true, remaining: "Vô Hạn (Cá nhân)" };
  }

  const data = loadData(PATHS.DATA);
  const rawTurns = data[uid];
  const currentTurns = typeof rawTurns === "number" ? rawTurns : Number(rawTurns?.count || 0);

  if (!Number.isFinite(currentTurns) || currentTurns <= 0) {
    return { status: false, isFree: false, remaining: 0 };
  }

  data[uid] = Math.max(0, currentTurns - 1);
  saveData(PATHS.DATA, data);

  return { status: true, isFree: false, remaining: data[uid] };
}

// --- HOÀN LƯỢT KHI XẢY RA LỖI VẼ ẢNH ---
function refundTurn(uid, threadId) {
  if (checkVohanBox(threadId)) return;
  const data = loadData(PATHS.DATA);
  if (checkPersonalVohan(uid)) return;
  const currentTurns = typeof data[uid] === "number" ? data[uid] : Number(data[uid]?.count || 0);
  if (Number.isFinite(currentTurns)) {
    data[uid] = currentTurns + 1;
    saveData(PATHS.DATA, data);
  }
}

export default {
  name: "boxscrim",
  aliases: ["scrim"],
  role: 0,
  cooldown: 15,
  description: "HNHANN VUA DEV",

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type ?? ThreadType.Group;
    const senderID = message.data.uidFrom;

    if (!isAssetsReady) {
      const commandCacheDir = path.join(__dirname, "boxscrim", "cache");
      fs.ensureDirSync(commandCacheDir);

      const fontAsset = {
        url: "https://github.com/google/fonts/raw/main/ofl/prompt/Prompt-Bold.ttf",
        path: "Prompt-Bold.ttf",
        family: "Prompt",
      };
      const fontPath = path.join(commandCacheDir, fontAsset.path);

      if (!fs.existsSync(fontPath)) {
        try {
          const { data } = await axios.get(fontAsset.url, { responseType: "arraybuffer" });
          fs.writeFileSync(fontPath, data);
        } catch (e) {
          console.error(`[BOXSCRIM] Lỗi khi tải font: ${e.message}`);
        }
      }

      try {
        registerFont(fontPath, { family: fontAsset.family });
      } catch (e) {
        console.error(`[BOXSCRIM] Lỗi đăng ký font: ${e.message}`);
      }
      isAssetsReady = true;
    }

    const input = args.join(" ");
    const usageMessage =
      `⚠️ Vui lòng nhập đúng định dạng:\n` +
      `boxscrim [luffy/itachi] | [Tiêu đề] | [Loại phòng] | [Mức giá] | [Dòng 1] | [Dòng 2] | [Banking]\n\n` +
      `Ví dụ:\n` +
      `boxscrim luffy | BOX CUS HNHANN | PHÒNG THƯỜNG | 5K - 10K - 15K | 13:00 - 15:00 6K | 20:00 - 22:00 8K | VIETCOMBANK 1040781361`;

    if (!input) return api.sendMessage(usageMessage, threadId, threadType);

    const parts = input.split("|").map((p) => p.trim());
    const theme = parts[0]?.toLowerCase();

    if (theme !== "luffy" && theme !== "itachi") {
      return api.sendMessage("❌ Theme không hợp lệ. Chỉ hỗ trợ 'luffy' hoặc 'itachi'.", threadId, threadType);
    }
    if (parts.length !== 7) {
      return api.sendMessage("❌ Nhập thiếu thông tin. Cần đúng 7 mục, phân tách bởi dấu '|'.", threadId, threadType);
    }

    const turnCheck = handleUserTurns(senderID, threadId);
    if (!turnCheck.status) {
      return api.sendMessage(
        "🚫 Bạn không có đủ lượt dùng hoặc nhóm chưa bật Vô Hạn Box.\nVui lòng dùng lệnh `luotdung check` để kiểm tra hoặc liên hệ Admin nạp thêm.",
        threadId,
        threadType
      );
    }

    const [_, title, roomType, subtitle, line1, line2, bankingInfo] = parts;

    try {
      api.sendMessage(`⏳ Đang xử lý ảnh theme '${theme}', vui lòng chờ giây lát...`, threadId, threadType);

      const imageData = { title, roomType, subtitle, line1, line2, bankingInfo };
      let imageBuffer;

      const imageDir = path.join(__dirname, "boxscrim", "cache");

      if (theme === "luffy") {
        imageData.imagePath = path.join(imageDir, LUFFY_BG_FILENAME);
        imageBuffer = await createLuffyImage(imageData);
      } else {
        imageData.imagePath = path.join(imageDir, ITACHI_BG_FILENAME);
        imageBuffer = await createItachiImage(imageData);
      }

      const tempImagePath = path.join(imageDir, `scrim_temp_${senderID}_${Date.now()}.png`);
      fs.writeFileSync(tempImagePath, imageBuffer);

      const statusText = turnCheck.isFree
        ? `💎 Trạng thái lượt: ${turnCheck.remaining}`
        : `🔄 Số lượt còn lại: ${turnCheck.remaining} lượt`;

      // --- HÀM GỬI TIN NHẮN KÈM ẢNH ĐƯỢC BÓC TÁCH TỪ DHBC ---
      await api.sendMessage(
        {
          msg: `🎉 Ảnh scrim của bạn với theme '${theme}' đã được tạo thành công!\n${statusText}`,
          attachments: [tempImagePath],
          ttl: 0,
        },
        threadId,
        threadType
      );

      // Xóa file temp sau khi gửi xong
      if (fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }
    } catch (processErr) {
      console.error("[BOXSCRIM] Lỗi quá trình tạo ảnh:", processErr);

      refundTurn(senderID, threadId);

      return api.sendMessage(
        `❌ Lỗi hệ thống khi tạo ảnh: ${processErr.message}\n🔄 Hệ thống đã hoàn trả lại 1 lượt dùng cho bạn.`,
        threadId,
        threadType
      );
    }
  },
};