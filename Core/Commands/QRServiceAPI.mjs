/**
 * QRServiceAPI.js
 * Sinh ảnh QR chuyển khoản (VietQR) hoặc QR ví điện tử, ghép logo ở giữa,
 * và ghép vào ảnh nền (background) theo layout JSON đi kèm.
 *
 * API:
 *   create({ keyname, bankCode, accountNumber, accountName, addInfo, background,
 *            walletQRBuffer, sourceQRBuffer })
 *     -> { path, buffer, meta }
 *
 * Ghi chú:
 * - Nếu bankCode thuộc ví điện tử (MOMO / MM / ZALOPAY / ZLP) thì phải truyền
 *   walletQRBuffer (buffer ảnh QR của ví đó) thay vì accountNumber.
 * - Ngược lại, sẽ tạo QR ngân hàng qua VietQR.io dựa trên bankCode + accountNumber.
 * - Nếu chưa có "<background>.png" + "<background>.json" trong thư mục background/,
 *   hệ thống sẽ TỰ ĐỘNG vẽ một nền mặc định đơn giản và lưu lại, để chạy được ngay
 *   mà không cần chuẩn bị ảnh trước. Sau này có thể thay bằng ảnh nền đẹp hơn.
 */

import fs from "fs-extra";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";
import { Jimp } from "jimp";
import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, "QRAPIAssets");
const BG_DIR = path.join(BASE_DIR, "background");
const LOGO_DIR = path.join(BASE_DIR, "logos");
const CACHE_DIR = path.join(BASE_DIR, "cache");

fs.ensureDirSync(BG_DIR);
fs.ensureDirSync(LOGO_DIR);
fs.ensureDirSync(CACHE_DIR);

const WALLET_TYPES = ["MOMO", "MM", "ZALOPAY", "ZLP"];

function isWallet(bankCode) {
  return WALLET_TYPES.includes(String(bankCode || "").toUpperCase());
}

// ─── Đọc nội dung QR từ ảnh (buffer) ─────────────────────────────────────────
async function decodeQRFromBuffer(buffer) {
  const img = await Jimp.read(buffer);
  const { data, width, height } = img.bitmap;
  const result = jsQR(new Uint8ClampedArray(data), width, height);
  if (!result || !result.data) throw new Error("Không đọc được QR");
  return result.data;
}

// ─── Lấy ảnh QR VietQR từ API img.vietqr.io ─────────────────────────────────
async function fetchVietQR({ bankCode, accountNumber, accountName = "", addInfo = "" }) {
  const url =
    "https://img.vietqr.io/image/" +
    bankCode +
    "-" +
    accountNumber +
    "-compact2.png?accountName=" +
    encodeURIComponent(accountName) +
    "&addInfo=" +
    encodeURIComponent(addInfo);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return res.data;
}

// ─── Vẽ QR content thành canvas ──────────────────────────────────────────────
async function createQRImage({ qrContent, size }) {
  const canvas = createCanvas(size, size);
  await QRCode.toCanvas(canvas, qrContent, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: size
  });
  return canvas;
}

// ─── Vẽ logo tròn ở giữa QR (nếu có logo.png) ───────────────────────────────
async function drawLogoToQR(qrCanvas) {
  const logoPath = path.join(LOGO_DIR, "logo.png");
  if (!fs.existsSync(logoPath)) return qrCanvas;

  const ctx = qrCanvas.getContext("2d");
  const logoImg = await loadImage(logoPath);
  const size = qrCanvas.width;

  const logoRatio = 0.15;
  const logoSize = Math.floor(size * logoRatio);
  const logoX = (size - logoSize) / 2;
  const logoY = (size - logoSize) / 2;

  const padding = Math.floor(logoSize * 0.18);
  const circleRadius = (logoSize + padding * 2) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, circleRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  return qrCanvas;
}

// ─── Vẽ nền mặc định nếu chưa có background tương ứng ───────────────────────
async function ensureDefaultBackground(backgroundName) {
  const bgPath = path.join(BG_DIR, backgroundName + ".png");
  const layoutPath = path.join(BG_DIR, backgroundName + ".json");
  if (fs.existsSync(bgPath) && fs.existsSync(layoutPath)) return;

  const width = 700;
  const height = 900;
  const qrSize = 500;
  const qrX = (width - qrSize) / 2;
  const qrY = 220;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // nền trắng + viền + tiêu đề đơn giản
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0b5ed7";
  ctx.fillRect(0, 0, width, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QUÉT MÃ THANH TOÁN", width / 2, 85);

  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

  ctx.fillStyle = "#333333";
  ctx.font = "24px sans-serif";
  ctx.fillText("Vui lòng kiểm tra kỹ nội dung chuyển khoản", width / 2, height - 60);

  fs.writeFileSync(bgPath, canvas.toBuffer());

  const layout = {
    qr: {
      x: qrX,
      y: qrY,
      size: qrSize,
      padding: 12,
      borderRadius: 24,
      backgroundColor: "#ffffff"
    }
  };
  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2));
}

// ─── Ghép QR vào nền theo layout JSON ────────────────────────────────────────
async function composeWithBackground({ qrCanvas, backgroundName }) {
  await ensureDefaultBackground(backgroundName);

  const bgPath = path.join(BG_DIR, backgroundName + ".png");
  const layoutPath = path.join(BG_DIR, backgroundName + ".json");
  if (!fs.existsSync(bgPath) || !fs.existsSync(layoutPath)) {
    throw new Error("Background hoặc JSON layout không tồn tại");
  }

  const bgImg = await loadImage(bgPath);
  const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));

  const canvas = createCanvas(bgImg.width, bgImg.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bgImg, 0, 0);

  const qr = layout.qr;
  const x = qr.x;
  const y = qr.y;
  const size = qr.size;
  const padding = qr.padding || 0;
  const radius = qr.borderRadius || 0;

  if (qr.backgroundColor) {
    ctx.fillStyle = qr.backgroundColor;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
    ctx.fill();
  }

  ctx.drawImage(qrCanvas, x + padding, y + padding, size - padding * 2, size - padding * 2);

  return canvas;
}

// ─── Hàm chính ───────────────────────────────────────────────────────────────
async function create(params) {
  const {
    keyname,
    accountNumber,
    bankCode,
    background,
    walletQRBuffer,
    sourceQRBuffer,
    accountName = "",
    addInfo = ""
  } = params;

  if (!keyname) throw new Error("Thiếu keyname");
  if (!background) throw new Error("Background là bắt buộc");
  if (!bankCode) throw new Error("Thiếu bankCode");

  let qrContent;
  // sourceQRBuffer dùng cho mọi ảnh QR thật (ngân hàng hoặc ví). Nó được ưu
  // tiên để bank2 setanh/setvi cũng luôn đi qua cùng pipeline QRAPI.
  if (sourceQRBuffer) {
    qrContent = await decodeQRFromBuffer(sourceQRBuffer);
  } else if (isWallet(bankCode)) {
    if (!walletQRBuffer) throw new Error("Thiếu ảnh QR ví điện tử");
    qrContent = await decodeQRFromBuffer(walletQRBuffer);
  } else {
    if (!accountNumber) throw new Error("Thiếu số tài khoản");
    const vietQrBuffer = await fetchVietQR({ bankCode, accountNumber, accountName, addInfo });
    qrContent = await decodeQRFromBuffer(vietQrBuffer);
  }

  let qrCanvas = await createQRImage({ qrContent, size: 600 });
  qrCanvas = await drawLogoToQR(qrCanvas);

  const finalCanvas = await composeWithBackground({ qrCanvas, backgroundName: background });

  const outPath = path.join(CACHE_DIR, keyname + ".png");
  fs.writeFileSync(outPath, finalCanvas.toBuffer());

  return {
    path: outPath,
    buffer: finalCanvas.toBuffer(),
    meta: {
      keyname,
      bankCode,
      background,
      isWallet: isWallet(bankCode)
    }
  };
}

export { create };
