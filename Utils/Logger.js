/**
 * Utils/Logger.js
 *
 * Logger tối giản. Tự động che các key nhạy cảm thường gặp (cookie, imei,
 * userAgent, token, password...) nếu chúng vô tình xuất hiện trong object
 * được log.
 *
 * Giao diện console:
 *  - banner(): chữ ASCII khối to (dùng figlet, font "ANSI Shadow") kèm dòng
 *    tagline + dòng credit, giống phong cách banner CLI phổ biến.
 *  - log thường: icon + tên level màu (kiểu signale/pino-pretty), metadata
 *    in gọn dạng key=value ngay dưới message.
 */

import { inspect } from "node:util";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

const LEVEL_STYLE = {
  debug: { icon: "◆", color: ANSI.magenta, label: "debug" },
  info: { icon: "ℹ", color: ANSI.cyan, label: "info " },
  warn: { icon: "▲", color: ANSI.yellow, label: "warn " },
  error: { icon: "✖", color: ANSI.red, label: "error" },
};

const SENSITIVE_KEYS = [
  "cookie",
  "cookies",
  "imei",
  "useragent",
  "user_agent",
  "token",
  "password",
  "secret",
  "session",
];

const SAFE_EXACT_KEYS = ["cookieCount"];

function redact(value, depth = 0) {
  if (depth > 4) return "[Object]";
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SAFE_EXACT_KEYS.includes(k)) {
        out[k] = v;
      } else if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * Tô màu cầu vồng kiểu "lolcat" cho một khối text nhiều dòng: mỗi ký tự
 * được tô theo gradient HSL chạy ngang qua cột, lệch dần theo hàng để tạo
 * hiệu ứng chéo (diagonal rainbow) thay vì các sọc ngang đơn điệu.
 */
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// 7 sắc cầu vồng cố định: đỏ, cam, vàng, lục, lam, chàm, tím.
const RAINBOW_7 = [
  [255, 0, 0],
  [255, 127, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 0, 255],
  [75, 0, 130],
  [148, 0, 211],
];

// Tô 7 sắc cầu vồng cố định cho từng ký tự (không tính khoảng trắng),
// dùng riêng cho những đoạn chữ ngắn như label "info".
function rainbow7(text, useColor) {
  if (!useColor) return text;
  let out = "";
  let i = 0;
  for (const ch of text) {
    if (ch === " ") {
      out += ch;
      continue;
    }
    const [r, g, b] = RAINBOW_7[i % RAINBOW_7.length];
    out += `\x1b[38;2;${r};${g};${b}m${ch}`;
    i++;
  }
  return out + ANSI.reset;
}

function rainbowText(text, useColor, { freq = 4, spread = 3 } = {}) {
  if (!useColor) return text;
  const lines = text.split("\n");
  return lines
    .map((line, row) => {
      let out = "";
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === " ") {
          out += ch;
          continue;
        }
        const hue = ((col * freq + row * spread * 6) % 360 + 360) % 360;
        const [r, g, b] = hslToRgb(hue, 0.85, 0.6);
        out += `\x1b[38;2;${r};${g};${b}m${ch}`;
      }
      return out + ANSI.reset;
    })
    .join("\n");
}

function createLogger(level = "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const useColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);

  function paint(code, text) {
    return useColor ? `${code}${text}${ANSI.reset}` : text;
  }

  function formatTime(date = new Date()) {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function formatMessage(value) {
    return String(value).replace(/^\[([^\]]+)]/, (_, moduleName) =>
      paint(`${ANSI.bold}${ANSI.blue}`, `[${moduleName}]`),
    );
  }

  function formatValue(value) {
    if (typeof value === "string") return value;
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
    if (value instanceof Error) return value.message;
    if (typeof value === "object") {
      return Object.entries(value)
        .map(([k, v]) => `${k}=${formatValue(v)}`)
        .join(" ");
    }
    return String(value);
  }

  function formatMeta(value) {
    if (value instanceof Error) {
      return paint(ANSI.red, value.stack || value.message);
    }
    if (typeof value === "object" && value !== null) {
      const safe = redact(value);
      const pairs = Object.entries(safe).map(([k, v]) => {
        const key = paint(ANSI.dim + ANSI.gray, `${k}=`);
        const val = paint(ANSI.white, formatValue(v));
        return `${key}${val}`;
      });
      if (pairs.length === 0) return null;
      return `      ${pairs.join(paint(ANSI.dim + ANSI.gray, "  ·  "))}`;
    }
    if (typeof value === "string") return `      ${formatMessage(value)}`;
    return `      ${inspect(value, { colors: useColor, depth: 5 })}`;
  }

  function emit(lvl, message, ...rest) {
    if (LEVELS[lvl] < threshold) return;
    const style = LEVEL_STYLE[lvl];

    const time = paint(ANSI.dim + ANSI.gray, formatTime());
    const icon =
      lvl === "info"
        ? rainbow7(style.icon, useColor)
        : paint(`${ANSI.bold}${style.color}`, style.icon);
    const label =
      lvl === "info"
        ? rainbow7(style.label, useColor)
        : paint(`${ANSI.bold}${style.color}`, style.label);
    const head = `${time}  ${icon}  ${label}  ${formatMessage(message)}`;

    const metaLines = rest.map(formatMeta).filter((line) => line !== null && line !== undefined);

    const output = metaLines.length > 0 ? `${head}\n${metaLines.join("\n")}` : head;

    if (lvl === "error") console.error(output);
    else if (lvl === "warn") console.warn(output);
    else console.log(output);
  }

  // Banner dự phòng (không phụ thuộc figlet) — dùng nếu package "figlet"
  // chưa được cài (ví dụ quên chạy `npm install` sau khi pull code mới).
  function fallbackBanner(title, subtitle) {
    console.log("");
    console.log(
      `  ${paint(ANSI.bold + ANSI.cyan, "⚡")}  ${paint(ANSI.bold + ANSI.white, title)}  ${paint(ANSI.dim, "—")}  ${paint(ANSI.dim, subtitle)}`,
    );
    console.log("");
  }

  return {
    debug: (...args) => emit("debug", ...args),
    info: (...args) => emit("info", ...args),
    warn: (...args) => emit("warn", ...args),
    error: (...args) => emit("error", ...args),

    // Dòng phân cách nhẹ, dùng để tách các giai đoạn khởi động trong log.
    // Không bắt buộc dùng.
    divider(label = "") {
      const width = 56;
      if (!label) {
        console.log(paint(ANSI.dim + ANSI.gray, "─".repeat(width)));
        return;
      }
      const text = ` ${label} `;
      const side = Math.max(0, Math.floor((width - text.length) / 2));
      const line = "─".repeat(side) + text + "─".repeat(Math.max(0, width - side - text.length));
      console.log(paint(ANSI.dim + ANSI.gray, line));
    },

    /**
     * In banner chữ khối to (ASCII art) bằng figlet, kèm tagline + dòng
     * credit — giống phong cách banner CLI của các bot phổ biến.
     */
    async banner(title = "NKNP V3", subtitle = "ZALO BOT • REALTIME SYSTEM") {
      let logo = null;
      try {
        const { default: figlet } = await import("figlet");
        logo = figlet.textSync(title, { font: "ANSI Shadow" });
      } catch {
        // Chưa cài "figlet" (chạy `npm install`) hoặc lỗi khác -> dùng
        // banner dự phòng, không làm crash bot.
      }

      if (!logo) {
        fallbackBanner(title, subtitle);
        return;
      }

      console.log("");
      console.log(rainbowText(logo, useColor));
      console.log(
        `  ${paint(ANSI.bold + ANSI.cyan, "⚡")}  ${paint(ANSI.bold + ANSI.white, title + " BOT")}  ${paint(ANSI.dim, "—")}  ${paint(ANSI.dim, subtitle)}`,
      );
      console.log(
        `  ${paint(ANSI.dim + ANSI.gray, new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}`,
      );
      console.log("");
    },

    /**
     * [NKNP V3] Khung thông tin viền hộp kiểu NKNP — in ngay dưới banner()
     * để hiển thị gọn: studio, phiên bản, prefix, danh sách admin/support...
     * @param {{title?: string, rows: Array<[string,string]>}} opts
     */
    infoBox({ title = "THÔNG TIN HỆ THỐNG", rows = [] } = {}) {
      const labelWidth = Math.max(...rows.map(([k]) => k.length), 10);
      const lines = rows.map(([k, v]) => `${k.padEnd(labelWidth, " ")} : ${v}`);
      const innerWidth = Math.max(title.length + 2, ...lines.map((l) => l.length)) + 2;

      const top = `╔${"═".repeat(innerWidth)}╗`;
      const bottom = `╚${"═".repeat(innerWidth)}╝`;
      const titlePad = Math.max(0, innerWidth - title.length);
      const titleLine = `║${" ".repeat(Math.floor(titlePad / 2))}${title}${" ".repeat(
        Math.ceil(titlePad / 2),
      )}║`;
      const sep = `╠${"═".repeat(innerWidth)}╣`;

      console.log(paint(ANSI.cyan, top));
      console.log(paint(ANSI.cyan, "║") + paint(ANSI.bold + ANSI.white, titleLine.slice(1, -1)) + paint(ANSI.cyan, "║"));
      console.log(paint(ANSI.cyan, sep));
      for (const line of lines) {
        const pad = innerWidth - line.length - 1;
        console.log(
          `${paint(ANSI.cyan, "║")} ${paint(ANSI.white, line)}${" ".repeat(Math.max(0, pad))}${paint(
            ANSI.cyan,
            "║",
          )}`,
        );
      }
      console.log(paint(ANSI.cyan, bottom));
      console.log("");
    },
  };
}

export { createLogger, redact };