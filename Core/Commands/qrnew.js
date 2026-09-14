// author @GwenDev - chuyển sang CommandRouter/adapter của NKNP V3
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create as createQrApi } from "./QRServiceAPI.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "data", "QRauto", "bankData2.json");
const triggerCooldowns = new Map();
const TRIGGER_COOLDOWN_MS = 3_000;
const QR_BACKGROUND = "BGQR1";

const keywords = [
  "mã", "qr", "stk", "quét mã", "chuyển khoản", "chuyển tiền",
  "phí ck", "phí chuyển khoản",
];

function readData() {
  try {
    if (!fs.existsSync(dataPath)) return {};
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return {};
  }
}

function matchKeyword(body, aliases = keywords) {
  const words = String(body || "")
    .toLowerCase()
    .normalize("NFC")
    .split(/[\s,.!?;:()"'\-\/\\]+/)
    .filter(Boolean);

  return aliases.some((alias) => {
    const aliasWords = alias.toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
    if (aliasWords.length === 1) return words.includes(aliasWords[0]);

    for (let i = 0; i <= words.length - aliasWords.length; i += 1) {
      if (aliasWords.every((word, index) => words[i + index] === word)) return true;
    }
    return false;
  });
}

function isOnTriggerCooldown(message) {
  const key = `${message.threadId}:${message.data?.uidFrom || "unknown"}`;
  const now = Date.now();
  const last = triggerCooldowns.get(key) || 0;
  if (now - last < TRIGGER_COOLDOWN_MS) return true;
  triggerCooldowns.set(key, now);

  if (triggerCooldowns.size > 1_000) {
    for (const [entryKey, time] of triggerCooldowns.entries()) {
      if (now - time > 60_000) triggerCooldowns.delete(entryKey);
    }
  }
  return false;
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

async function renderBankThroughQrApi(threadId, info) {
  if (info.bankCode && info.accountNumber) {
    const result = await createQrApi({
      keyname: `view_bank_${threadId}_${Date.now()}`,
      bankCode: info.bankCode,
      accountNumber: info.accountNumber,
      accountName: info.accountName || "",
      addInfo: info.addInfo || "",
      background: QR_BACKGROUND,
    });
    return result.path;
  }

  if (info.qrPath && fs.existsSync(info.qrPath)) {
    const result = await createQrApi({
      keyname: `view_custom_${threadId}_${Date.now()}`,
      bankCode: "CUSTOM",
      accountName: info.accountName || "",
      addInfo: info.addInfo || "",
      background: QR_BACKGROUND,
      sourceQRBuffer: fs.readFileSync(info.qrPath),
    });
    return result.path;
  }
  return null;
}

async function renderWalletThroughQrApi(threadId, wallet) {
  if (!wallet.qrPath || !fs.existsSync(wallet.qrPath)) return null;
  const result = await createQrApi({
    keyname: `view_wallet_${threadId}_${wallet.walletCode || "wallet"}_${Date.now()}`,
    bankCode: wallet.walletCode || "WALLET",
    accountName: wallet.accountName || "",
    addInfo: wallet.addInfo || "",
    background: QR_BACKGROUND,
    sourceQRBuffer: fs.readFileSync(wallet.qrPath),
  });
  return result.path;
}

async function showPaymentInfo({ adapter, message }) {
  const info = readData()[message.threadId];
  const hasBank = Boolean(info?.accountNumber || info?.accountName);
  const hasWallets = Array.isArray(info?.wallets) && info.wallets.length > 0;
  if (!info || (!hasBank && !hasWallets)) return;

  if (hasBank) {
    const bankText =
      `💳 Số TK: ${info.accountNumber || "Không có"}\n` +
      `🏦 Ngân hàng: ${info.bankName || "Không có"}\n` +
      `👤 Chủ TK: ${info.accountName || "Không có"}\n` +
      `📝 Nội dung: ${info.addInfo || "Không có"}`;
    // Không gửi thẳng file đã lưu: luôn dựng ảnh đầu ra qua QRAPI.
    const imagePath = await renderBankThroughQrApi(message.threadId, info);
    await send(adapter, message, bankText, imagePath);
  }

  if (hasWallets) {
    for (const wallet of info.wallets) {
      const walletText =
        `👛 Ví: ${wallet.walletName || wallet.walletCode || "Không rõ"}\n` +
        `👤 Chủ ví: ${wallet.accountName || "Không có"}\n` +
        `📝 Nội dung: ${wallet.addInfo || "Không có"}`;
      const imagePath = await renderWalletThroughQrApi(message.threadId, wallet);
      await send(adapter, message, walletText, imagePath);
    }
  }
}

const command = {
  name: "qrnew",
  aliases: ["qrview"],
  noPrefix: true,
  role: 0,
  cooldown: 3,
  version: "2.0.0",
  author: "@GwenDev / converted for NKNP V3",
  description: "Tự hiện QR khi tin nhắn chứa từ khóa thanh toán",
  isMatch: (body) => matchKeyword(body, keywords),

  // Cho phép dùng !qrview nếu muốn kiểm tra thủ công.
  async run({ adapter, message }) {
    await showPaymentInfo({ adapter, message });
  },

  // Router hiện tại chạy onMessage trước phần nhận lệnh có prefix.
  async onMessage({ adapter, message, logger }) {
    if (message?.isSelf) return;
    const body = typeof message?.data?.content === "string" ? message.data.content : null;
    if (!body || !matchKeyword(body, keywords)) return;
    if (isOnTriggerCooldown(message)) return;

    try {
      await showPaymentInfo({ adapter, message });
    } catch (err) {
      logger?.error?.("[qrview] Không thể hiển thị QR:", { message: err?.message });
    }
  },
};

export default command;
