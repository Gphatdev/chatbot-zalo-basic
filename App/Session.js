import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { Zalo, LoginQRCallbackEventType } from "zca-mt";
import { NetworkError, AuthenticationError, ZaloApiError } from "zca-mt";

/**
 * App/Session.js — bảo mật cao + backup + Windows ACL
 *
 * Tính năng:
 * - Mã hóa AES-256-GCM
 * - Tự động backup session (tối đa 5 bản)
 * - Tự xóa QR sau đăng nhập
 * - Xóa session hỏng
 * - Siết quyền file trên Windows bằng icacls
 * - Tương thích file session cũ (plain text)
 */

const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000];
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAX_BACKUPS = 5;

// ====================== MÃ HÓA / GIẢI MÃ ======================

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return crypto
      .createHash("sha256")
      .update("nknp-v3-default-secret-change-me")
      .digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSession(data) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptSession(base64Data) {
  try {
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;

    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// ====================== BACKUP ======================

function getBackupPath(sessionPath, index = 0) {
  // session.json → session.json.bak
  // session.json.bak → session.json.bak.1 ... session.json.bak.4
  if (index === 0) return `${sessionPath}.bak`;
  return `${sessionPath}.bak.${index}`;
}

function rotateBackups(sessionPath, logger) {
  try {
    // Xóa bản cũ nhất nếu đã đủ MAX_BACKUPS
    const oldest = getBackupPath(sessionPath, MAX_BACKUPS - 1);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // Dời các bản cũ lên 1 nấc (bak.3 → bak.4, bak.2 → bak.3 ...)
    for (let i = MAX_BACKUPS - 2; i >= 0; i--) {
      const from = getBackupPath(sessionPath, i);
      const to = getBackupPath(sessionPath, i + 1);
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }

    // Backup bản hiện tại thành .bak
    if (fs.existsSync(sessionPath)) {
      fs.copyFileSync(sessionPath, getBackupPath(sessionPath, 0));
      logger?.info?.("[Session] Đã tạo backup session");
    }
  } catch (err) {
    logger?.warn?.("[Session] Lỗi khi tạo backup", {
      message: err?.message,
    });
  }
}

function tryLoadFromBackup(sessionPath, logger) {
  for (let i = 0; i < MAX_BACKUPS; i++) {
    const bakPath = getBackupPath(sessionPath, i);
    if (!fs.existsSync(bakPath)) continue;

    try {
      const raw = fs.readFileSync(bakPath, "utf8").trim();
      let data = null;

      if (raw.startsWith("{")) {
        data = JSON.parse(raw);
      } else {
        data = decryptSession(raw);
      }

      if (data?.cookie && data?.imei && data?.userAgent) {
        logger?.info?.(`[Session] Khôi phục session từ backup #${i}`);
        return data;
      }
    } catch {
      // bỏ qua backup hỏng
    }
  }
  return null;
}

// ====================== QUYỀN FILE (WINDOWS) ======================

function hardenFilePermissions(filePath, logger) {
  try {
    // Linux / macOS
    fs.chmodSync(filePath, 0o600);

    // Windows — dùng icacls để siết quyền
    if (process.platform === "win32") {
      try {
        // Xóa kế thừa + chỉ cho user hiện tại Full control
        const user = process.env.USERNAME || process.env.USER || "Everyone";
        execSync(
          `icacls "${filePath}" /inheritance:r /grant:r "${user}:F" /C`,
          { stdio: "ignore" },
        );
        logger?.info?.("[Session] Đã siết quyền file trên Windows");
      } catch (err) {
        logger?.warn?.("[Session] Không thể siết ACL Windows (cần quyền admin?)", {
          message: err?.message,
        });
      }
    }
  } catch (err) {
    logger?.warn?.("[Session] Không thể đặt quyền file", {
      message: err?.message,
    });
  }
}

// ====================== FILE HELPERS ======================

function saveSessionFile(sessionPath, data, logger) {
  try {
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

    // Backup trước khi ghi đè
    rotateBackups(sessionPath, logger);

    const encrypted = encryptSession(data);
    fs.writeFileSync(sessionPath, encrypted, { mode: 0o600 });

    // Siết quyền
    hardenFilePermissions(sessionPath, logger);
  } catch (err) {
    throw new Error(`Không thể lưu session: ${err.message}`);
  }
}

function loadSessionFile(sessionPath, logger) {
  // 1. Thử file chính
  if (fs.existsSync(sessionPath)) {
    try {
      const raw = fs.readFileSync(sessionPath, "utf8").trim();

      if (raw.startsWith("{")) {
        // File cũ plain text
        const parsed = JSON.parse(raw);
        if (parsed?.cookie && parsed?.imei && parsed?.userAgent) {
          return parsed;
        }
      } else {
        // File mã hóa
        const data = decryptSession(raw);
        if (data?.cookie && data?.imei && data?.userAgent) {
          return data;
        }
      }
    } catch {
      // rơi xuống backup
    }
  }

  // 2. Thử các bản backup
  return tryLoadFromBackup(sessionPath, logger);
}

function deleteFileSafe(filePath, logger) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger?.info?.("[Session] Đã xóa file tạm an toàn");
    }
  } catch (err) {
    logger?.warn?.("[Session] Không thể xóa file tạm", {
      message: err?.message,
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err) {
  if (err instanceof NetworkError) return true;
  const code = err?.cause?.code || err?.code;
  return ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(
    code,
  );
}

// ====================== IMAGE METADATA ======================

async function imageMetadataGetter(filePath) {
  try {
    const [stat, metadata] = await Promise.all([
      fs.promises.stat(filePath),
      sharp(filePath).metadata(),
    ]);

    if (!metadata?.width || !metadata?.height) return null;

    return {
      width: metadata.width,
      height: metadata.height,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

// ====================== LOGIN QR ======================

async function loginWithQR({ qrPath, sessionPath, logger }) {
  const zalo = new Zalo({ logging: false, imageMetadataGetter });

  logger.info("[Session] Đang tạo mã QR để đăng nhập...");

  const api = await zalo.loginQR({ qrPath }, async (event) => {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        await event.actions.saveToFile(qrPath);
        logger.info(
          `[Session] Mã QR đã sẵn sàng. Mở file QR và quét bằng app Zalo ` +
            "(Cài đặt > Thiết bị > Quét mã QR).",
        );
        break;

      case LoginQRCallbackEventType.QRCodeScanned:
        logger.info(
          `[Session] Đã quét bởi: ${event.data?.display_name || "người dùng"}. ` +
            "Vui lòng xác nhận trên điện thoại...",
        );
        break;

      case LoginQRCallbackEventType.QRCodeExpired:
        logger.warn("[Session] Mã QR hết hạn, đang tạo mã mới...");
        event.actions.retry();
        break;

      case LoginQRCallbackEventType.QRCodeDeclined:
        logger.error("[Session] Đăng nhập bị từ chối trên điện thoại.");
        event.actions.abort();
        break;

      case LoginQRCallbackEventType.GotLoginInfo:
        saveSessionFile(sessionPath, event.data, logger);
        logger.info("[Session] ✓ Đã lưu session (đã mã hóa + backup).");
        deleteFileSafe(qrPath, logger);
        break;
    }
  });

  // Phòng trường hợp GotLoginInfo không fire
  deleteFileSafe(qrPath, logger);

  return api;
}

// ====================== LOGIN CHÍNH ======================

async function loginWithSavedSessionOrQR({ sessionPath, qrPath, logger }) {
  const saved = loadSessionFile(sessionPath, logger);

  if (saved) {
    logger.info("[Session] Tìm thấy session → thử đăng nhập...");

    const zalo = new Zalo({ logging: false, imageMetadataGetter });

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const api = await zalo.login(saved);
        logger.info("[Session] ✓ Đăng nhập bằng session thành công.");
        return api;
      } catch (err) {
        if (isNetworkError(err)) {
          if (attempt < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[attempt];
            logger.warn(
              `[Session] Lỗi mạng tạm thời → thử lại sau ${delay}ms ` +
                `(${attempt + 1}/${RETRY_DELAYS_MS.length})`,
            );
            await sleep(delay);
            continue;
          }
          logger.error("[Session] Hết số lần retry lỗi mạng khi dùng session.");
          break;
        }

        if (err instanceof AuthenticationError || err instanceof ZaloApiError) {
          logger.warn(
            "[Session] Session không còn hợp lệ / đã hết hạn → chuyển sang quét QR...",
          );
          // Xóa session chính (backup vẫn còn)
          deleteFileSafe(sessionPath, logger);
          break;
        }

        logger.error("[Session] Lỗi không xác định khi dùng session:", {
          message: err?.message ?? String(err),
        });
        break;
      }
    }
  } else {
    logger.info("[Session] Chưa có session hợp lệ → bắt đầu quét QR...");
  }

  return loginWithQR({ qrPath, sessionPath, logger });
}

export { loginWithQR, loginWithSavedSessionOrQR };