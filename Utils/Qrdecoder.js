import sharp from "sharp";
import jsQR from "jsqr";

/**
 * Utils/QrDecoder.js
 *
 * Giải mã nội dung QR code từ một file ảnh trên đĩa (hoặc buffer).
 * Dùng cho AntiQR trong anti.js — kiểm tra link bên trong QR trước khi
 * cho phép hoặc xử phạt.
 */
async function decodeQrFromImage(imagePathOrBuffer) {
  try {
    const image = sharp(imagePathOrBuffer);
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    return code?.data || null;
  } catch {
    return null;
  }
}

export { decodeQrFromImage };