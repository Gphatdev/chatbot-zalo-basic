import "dotenv/config";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

/**
 * App/Config.js
 *
 * Đọc và validate toàn bộ biến môi trường cần thiết cho NKNP V3.
 * Bot đăng nhập bằng QR (và tự lưu session để lần sau không cần quét lại) —
 * không yêu cầu người dùng tự điền cookie/imei/userAgent thủ công.
 *
 * [NKNP V3] Bổ sung: đọc thêm config.yml (mang phong cách cấu hình của NKNP —
 * dễ chỉnh tay, không cần restart validate như .env) để cấp dữ liệu cho lớp
 * LegacyBridge (global.config.admin_bot/support_bot/prefix/...) mà các lệnh
 * port từ NKNP cần. Khi 2 nguồn trùng khoá, .env luôn được ưu tiên.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadYamlConfig() {
  try {
    const yamlPath = path.join(__dirname, "..", "config.yml");
    if (!fs.existsSync(yamlPath)) return {};
    return YAML.parse(fs.readFileSync(yamlPath, "utf8")) || {};
  } catch (err) {
    console.warn(`[Config] Không đọc được config.yml (${err.message}) — dùng giá trị mặc định.`);
    return {};
  }
}

function maskSecret(value, visible = 4) {
  if (!value) return "(trống)";
  const str = String(value);
  if (str.length <= visible) return "*".repeat(str.length);
  return `${str.slice(0, visible)}${"*".repeat(Math.max(str.length - visible, 3))}`;
}

const envSchema = z.object({
  BOT_NAME: z.string().min(1, "BOT_NAME không được để trống").default("NKNP V3"),
  BOT_PREFIX: z.string().min(1, "BOT_PREFIX không được để trống").default("!"),
  // OWNER_ZALO_ID có thể để trống lúc lần đầu chạy (chưa biết UID của mình).
  // Sau khi quét QR lần đầu, log sẽ in ra UID để bạn điền lại vào .env.
  OWNER_ZALO_ID: z.string().optional().default(""),

  SESSION_PATH: z.string().default("./App/Session.json"),
  QR_PATH: z.string().default("./qr.png"),

  DB_PATH: z.string().default("./Data/nknp-v3.db"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  ANTI_LINK_ALLOWLIST: z.string().optional().default(""),

  // [NKNP V3] Bắt buộc để xác thực với server license trước khi bot chạy.
  // Xem App/License.js — không hợp lệ thì bot dừng ngay, không đăng nhập Zalo.
  API_TOKEN: z.string().optional().default(""),
  API_LICENSE: z.string().optional().default(""),
});

function loadConfig() {
  const parsedEnv = envSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[Config] Cấu hình .env không hợp lệ:\n${issues}\n` +
        "Hãy kiểm tra lại file .env dựa trên .env.example.",
    );
  }

  const env = parsedEnv.data;
  const yamlConfig = loadYamlConfig();

  // [NKNP V3] Danh sách admin: gộp OWNER_ZALO_ID (.env) + admin_bot (config.yml),
  // loại trùng, loại rỗng — dùng cho cả CommandRouter (EMPHAT) lẫn LegacyBridge (NKNP).
  const yamlAdmins = Array.isArray(yamlConfig.admin_bot) ? yamlConfig.admin_bot : [];
  const yamlSupport = Array.isArray(yamlConfig.support_bot) ? yamlConfig.support_bot : [];
  const legacyAdminBot = [...new Set([env.OWNER_ZALO_ID, ...yamlAdmins].map(String).filter(Boolean))];
  const legacySupportBot = [...new Set([...yamlSupport].map(String).filter(Boolean))];

  return {
    botName: env.BOT_NAME !== "NKNP V3" ? env.BOT_NAME : yamlConfig.name_bot || env.BOT_NAME,
    botPrefix: env.BOT_PREFIX !== "!" ? env.BOT_PREFIX : yamlConfig.prefix || env.BOT_PREFIX,
    ownerZaloId: env.OWNER_ZALO_ID || null,

    sessionPath: env.SESSION_PATH,
    qrPath: env.QR_PATH,

    dbPath: env.DB_PATH,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,

    apiToken: env.API_TOKEN,
    apiLicense: env.API_LICENSE,

    antiLinkAllowlist: env.ANTI_LINK_ALLOWLIST.split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),

    // ----- [NKNP V3] Dữ liệu dành riêng cho LegacyBridge (global.config.*) -----
    studioName: yamlConfig.studio || "NKNP STUDIO",
    legacyVersion: yamlConfig.version || "3.0.0",
    legacyAdminBot: legacyAdminBot,
    legacySupportBot: legacySupportBot,
    legacyAllowPrivateCommand: yamlConfig.allow_private_command !== false,
    legacyDefaultMoney: Number(yamlConfig.default_money) || 0,
    social: yamlConfig.social || {},
  };
}

// Bản tóm tắt an toàn để log khi khởi động — không lộ secret thật.
function describeConfigSafe(config) {
  return {
    botName: config.botName,
    botPrefix: config.botPrefix,
    ownerZaloId: config.ownerZaloId || "(chưa đặt — sẽ hiện UID sau khi đăng nhập)",
    sessionPath: config.sessionPath,
    dbPath: config.dbPath,
    port: config.port,
    logLevel: config.logLevel,
    apiToken: maskSecret(config.apiToken),
    apiLicense: maskSecret(config.apiLicense),
  };
}

export const config = loadConfig();
export { loadConfig, describeConfigSafe, maskSecret };
