// Chuyển đổi từ bản @GwenDev sang CommandRouter/adapter của bot.
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { fileURLToPath } from "node:url";
import { resolveSenderRole } from "../CommandRouter.js";
import { create as createQrApi } from "./QRServiceAPI.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "data", "QRauto", "bankData2.json");
const qrFolder = path.join(__dirname, "data", "QRauto", "bankQR2");
const QR_BACKGROUND = "BGQR1";

const bankNames = {
  ABBANK: "ABBANK", ACB: "ACB", VBA: "Agribank", BAOVIETBANK: "Bảo Việt Bank",
  BIDV: "BIDV", BVB: "Bảo Việt Bank", CBBANK: "CBBank", COOPBANK: "CoopBank",
  DONGABANK: "Đông Á Bank", EXIMBANK: "Eximbank", GPBANK: "GPBank", HDBANK: "HDBank",
  IBK_HCM: "IBK HCM", IBK_HN: "IBK HN", INDOVINA: "Indovina Bank",
  KIENLONGBANK: "Kiên Long Bank", LIENVIETPOSTBANK: "Liên Việt Post Bank",
  LPB: "LPBank", MB: "MB Bank", MSB: "MSB", MBB: "MB Bank", NAMABANK: "Nam Á Bank",
  NCB: "NCB", NONGHYUP: "NongHyup", OCB: "OCB", OCEANBANK: "OceanBank",
  PGBANK: "PGBank", PUBLICBANK: "Public Bank", PVCOMBANK: "PVcomBank",
  SAIGONBANK: "SaigonBank", SCB: "SCB", SEABANK: "SeABank", SHB: "SHB",
  SHINHANBANK: "Shinhan Bank", TCB: "Techcombank", TPBANK: "TPBank", UBANK: "UBank",
  VIB: "VIB", VIETABANK: "VietABank", VIETBANK: "VietBank",
  VIETCAPITALBANK: "VietCapitalBank", VIETCOMBANK: "Vietcombank", VCB: "Vietcombank",
  VIETINBANK: "VietinBank", VPBANK: "VPBank", VPB: "VPBank", VRB: "VRB",
  VCCB: "BVBank", WOORIBANK: "Woori Bank",
};

const walletNames = {
  MOMO: "Momo", ZALOPAY: "ZaloPay", VNPAY: "VNPay", SHOPEEPAY: "ShopeePay",
  VIETTELMONEY: "Viettel Money", VNPTMONEY: "VNPT Money", WEPAY: "WePay",
  MOCA: "Moca", VIMASS: "ViMass", TRUEMONEY: "TrueMoney", PAYOO: "Payoo",
};

function ensureStorage() {
  fs.mkdirSync(qrFolder, { recursive: true });
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}", "utf8");
}

function readData() {
  try {
    ensureStorage();
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return {};
  }
}

function writeData(data) {
  ensureStorage();
  const tempPath = `${dataPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, dataPath);
}

function parseJson(value) {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function pickImageUrl(value, seen = new Set()) {
  if (!value || seen.has(value)) return null;
  if (typeof value === "object") seen.add(value);
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return value;
    return pickImageUrl(parseJson(value), seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickImageUrl(item, seen);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of ["href", "normalUrl", "hdUrl", "thumbUrl", "url", "oriUrl", "thumb", "thumbnail", "attach", "content", "params"]) {
      const found = pickImageUrl(value[key], seen);
      if (found) return found;
    }
  }
  return null;
}

function extractImageUrl(message) {
  const data = message?.data || message;
  for (const value of [data?.content, data?.attach, data?.attachments, data?.params, data?.quote, data?.quoteMsg]) {
    const url = pickImageUrl(value);
    if (url) return url;
  }
  return null;
}

async function downloadImage(url, destination) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20_000,
    maxContentLength: 15 * 1024 * 1024,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
  });
  fs.writeFileSync(destination, response.data);
}

async function downloadImageBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20_000,
    maxContentLength: 15 * 1024 * 1024,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
  });
  return Buffer.from(response.data);
}

async function send(adapter, message, text, imagePath = null) {
  const threadId = message.threadId;
  const threadType = message.type === 1 ? "group" : "user";
  if (!imagePath) return adapter.sendText({ threadId, threadType, text });

  if (typeof adapter.sendImage === "function") {
    return adapter.sendImage({ threadId, threadType, imagePath, caption: text, text });
  }
  if (typeof adapter.sendFile === "function") {
    return adapter.sendFile({ threadId, threadType, filePath: imagePath, caption: text });
  }
  if (typeof adapter.sendMessage === "function") {
    return adapter.sendMessage({ msg: text, attachments: [imagePath] }, threadId, message.type);
  }
  await adapter.sendText({ threadId, threadType, text });
  return adapter.sendText({ threadId, threadType, text: `Ảnh QR đã lưu tại: ${imagePath}` });
}

function splitNameAndNote(args, start) {
  const raw = args.slice(start).join(" ");
  const [name, ...note] = raw.split("|");
  return { accountName: name.trim(), addInfo: note.join("|").trim() };
}

async function saveBank(threadId, accountNumber, bankCode, accountName, addInfo) {
  ensureStorage();
  const result = await createQrApi({
    keyname: `bank_${threadId}_${Date.now()}`,
    bankCode,
    accountNumber,
    accountName,
    addInfo,
    background: QR_BACKGROUND,
  });
  const qrPath = result.path;
  const data = readData();
  data[threadId] = { ...(data[threadId] || {}), accountNumber, bankCode, bankName: bankNames[bankCode], accountName, addInfo, qrPath };
  writeData(data);
}

async function saveQrImage(threadId, accountName, addInfo, imageUrl) {
  ensureStorage();
  const sourceQRBuffer = await downloadImageBuffer(imageUrl);
  const result = await createQrApi({
    keyname: `custom_${threadId}_${Date.now()}`,
    bankCode: "CUSTOM",
    accountName,
    addInfo,
    background: QR_BACKGROUND,
    sourceQRBuffer,
  });
  const qrPath = result.path;
  const data = readData();
  const previous = data[threadId] || {};
  data[threadId] = { ...previous, accountNumber: previous.accountNumber || "", bankCode: previous.bankCode || "", bankName: previous.bankName || "", accountName, addInfo, qrPath };
  writeData(data);
}

async function saveWallet(threadId, walletCode, accountName, addInfo, imageUrl) {
  ensureStorage();
  const sourceQRBuffer = await downloadImageBuffer(imageUrl);
  const result = await createQrApi({
    keyname: `wallet_${threadId}_${walletCode}_${Date.now()}`,
    bankCode: walletCode,
    accountName,
    addInfo,
    background: QR_BACKGROUND,
    sourceQRBuffer,
  });
  const qrPath = result.path;
  const data = readData();
  const previous = data[threadId] || {};
  const wallets = Array.isArray(previous.wallets) ? previous.wallets.filter((w) => w.walletCode !== walletCode) : [];
  wallets.push({ walletCode, walletName: walletNames[walletCode], accountName, addInfo, qrPath });
  data[threadId] = { ...previous, wallets };
  writeData(data);
}

function removeWallet(threadId, walletCode) {
  const data = readData();
  const wallets = data[threadId]?.wallets;
  if (!Array.isArray(wallets)) return false;
  const index = wallets.findIndex((wallet) => wallet.walletCode === walletCode);
  if (index < 0) return false;
  const [removed] = wallets.splice(index, 1);
  if (removed?.qrPath && fs.existsSync(removed.qrPath)) fs.unlinkSync(removed.qrPath);
  writeData(data);
  return true;
}

async function showEntry(adapter, message, info, walletsOnly = false) {
  if (!walletsOnly && (info.accountName || info.accountNumber)) {
    const text = `💳 Số TK: ${info.accountNumber || "Không có"}\n🏦 Ngân hàng: ${info.bankName || "Không có"}\n👤 Chủ TK: ${info.accountName || "Không có"}\n📝 Nội dung: ${info.addInfo || "Không có"}`;
    await send(adapter, message, text, info.qrPath && fs.existsSync(info.qrPath) ? info.qrPath : null);
  }
  for (const wallet of Array.isArray(info.wallets) ? info.wallets : []) {
    const text = `👛 Ví: ${wallet.walletName}\n👤 Chủ ví: ${wallet.accountName}\n📝 Nội dung: ${wallet.addInfo || "Không có"}`;
    await send(adapter, message, text, wallet.qrPath && fs.existsSync(wallet.qrPath) ? wallet.qrPath : null);
  }
}

const crossGroupCommands = new Set(["setnhom", "infonhom", "shownhom", "lammoinhom", "setvinhom", "infovinhom", "showvinhom", "lammoivinhom", "setanhnhom"]);

export default {
  name: "bank2",
  aliases: ["thanhtoan"],
  role: 1,
  cooldown: 5,
  version: "2.0.0",
  author: "@GwenDev / converted for NKNP V3",
  description: "Quản lý QR ngân hàng và ví điện tử",

  async run({ adapter, message, args, config, logger }) {
    const sub = (args[0] || "help").toLowerCase();
    const threadId = message.threadId;
    ensureStorage();

    if (crossGroupCommands.has(sub)) {
      const role = await resolveSenderRole(
        { adapter, isOwner: (uid) => uid === config.ownerZaloId },
        message,
        message.data.uidFrom,
      );
      if (role < 2) return send(adapter, message, "⚠️ Chỉ owner được thao tác với nhóm khác.");
    }

    try {
      if (sub === "set" || sub === "setnhom") {
        const offset = sub === "setnhom" ? 1 : 0;
        const targetId = offset ? args[1] : threadId;
        if (args.length < 4 + offset) return send(adapter, message, `❌ Dùng: bank2 ${sub} ${offset ? "<id nhóm> " : ""}<stk> <mãBank> <chủ thẻ> [| nội dung]`);
        const accountNumber = args[1 + offset];
        const bankCode = args[2 + offset].toUpperCase();
        if (!bankNames[bankCode]) return send(adapter, message, "❌ Mã ngân hàng không hợp lệ.");
        const { accountName, addInfo } = splitNameAndNote(args, 3 + offset);
        await saveBank(targetId, accountNumber, bankCode, accountName, addInfo);
        return send(adapter, message, `✅ Đã lưu thông tin ngân hàng${offset ? ` cho nhóm ${targetId}` : " của nhóm"}.`);
      }

      if (sub === "setanh" || sub === "setanhnhom") {
        const offset = sub === "setanhnhom" ? 1 : 0;
        const targetId = offset ? args[1] : threadId;
        if (args.length < 2 + offset) return send(adapter, message, `❌ Dùng: bank2 ${sub} ${offset ? "<id nhóm> " : ""}<chủ TK> [| nội dung] và đính kèm/reply ảnh QR.`);
        const imageUrl = extractImageUrl(message);
        if (!imageUrl) return send(adapter, message, "❌ Không tìm thấy ảnh QR đính kèm hoặc ảnh được reply.");
        const { accountName, addInfo } = splitNameAndNote(args, 1 + offset);
        await saveQrImage(targetId, accountName, addInfo, imageUrl);
        return send(adapter, message, `✅ Đã lưu ảnh QR${offset ? ` cho nhóm ${targetId}` : " của nhóm"}.`);
      }

      if (sub === "setvi" || sub === "setvinhom") {
        const offset = sub === "setvinhom" ? 1 : 0;
        const targetId = offset ? args[1] : threadId;
        if (args.length < 3 + offset) return send(adapter, message, `❌ Dùng: bank2 ${sub} ${offset ? "<id nhóm> " : ""}<mãVí> <chủ ví> [| nội dung] và đính kèm/reply QR.`);
        const walletCode = args[1 + offset].toUpperCase();
        if (!walletNames[walletCode]) return send(adapter, message, `❌ Mã ví không hợp lệ: ${Object.keys(walletNames).join(", ")}`);
        const imageUrl = extractImageUrl(message);
        if (!imageUrl) return send(adapter, message, "❌ Không tìm thấy ảnh QR ví đính kèm hoặc ảnh được reply.");
        const { accountName, addInfo } = splitNameAndNote(args, 2 + offset);
        await saveWallet(targetId, walletCode, accountName, addInfo, imageUrl);
        return send(adapter, message, `✅ Đã lưu ví ${walletNames[walletCode]}${offset ? ` cho nhóm ${targetId}` : ""}.`);
      }

      if (["info", "show", "infovi", "showvi", "infonhom", "shownhom", "infovinhom", "showvinhom"].includes(sub)) {
        const isOther = sub.endsWith("nhom");
        const targetId = isOther ? args[1] : threadId;
        const info = readData()[targetId];
        const walletsOnly = sub.includes("vi");
        if (!targetId || !info) return send(adapter, message, "📭 Chưa có thông tin thanh toán.");
        if (walletsOnly && (!Array.isArray(info.wallets) || info.wallets.length === 0)) return send(adapter, message, "📭 Nhóm này chưa có ví điện tử.");
        await showEntry(adapter, message, info, walletsOnly);
        return;
      }

      if (sub === "lammoi" || sub === "lammoinhom") {
        const targetId = sub === "lammoinhom" ? args[1] : threadId;
        const data = readData();
        if (!targetId || !data[targetId]) return send(adapter, message, "❌ Chưa có thông tin để xóa.");
        const old = data[targetId];
        if (old.qrPath && fs.existsSync(old.qrPath)) fs.unlinkSync(old.qrPath);
        delete old.accountNumber; delete old.bankCode; delete old.bankName;
        delete old.accountName; delete old.addInfo; delete old.qrPath;
        if (!Array.isArray(old.wallets) || old.wallets.length === 0) delete data[targetId];
        writeData(data);
        return send(adapter, message, "✅ Đã xóa thông tin ngân hàng.");
      }

      if (sub === "lammoivi" || sub === "lammoivinhom") {
        const other = sub === "lammoivinhom";
        const targetId = other ? args[1] : threadId;
        const walletCode = (args[other ? 2 : 1] || "").toUpperCase();
        if (!targetId || !walletCode) return send(adapter, message, `❌ Dùng: bank2 ${sub} ${other ? "<id nhóm> " : ""}<mãVí>`);
        if (!removeWallet(targetId, walletCode)) return send(adapter, message, "❌ Không tìm thấy ví cần xóa.");
        return send(adapter, message, `✅ Đã xóa ví ${walletNames[walletCode] || walletCode}.`);
      }

      return send(adapter, message,
        "📌 Lệnh thanh toán:\n" +
        "• bank2 set <stk> <mã NH> <chủ thẻ> [| nội dung]\n" +
        "• bank2 setanh <chủ TK> [| nội dung] + ảnh/reply QR\n" +
        "• bank2 info | lammoi\n" +
        "• bank2 setvi <mãVí> <chủ ví> [| nội dung] + ảnh/reply QR\n" +
        "• bank2 infovi | lammoivi <mãVí>\n" +
        "• Thêm 'nhom' vào lệnh và ID nhóm để owner thao tác nhóm khác.\n" +
        `• Mã ví: ${Object.keys(walletNames).join(", ")}`,
      );
    } catch (err) {
      logger?.error?.("[bank2] Lỗi:", { message: err?.message });
      return send(adapter, message, `❌ Không thể thực hiện: ${err?.message || "lỗi không xác định"}`);
    }
  },
};
