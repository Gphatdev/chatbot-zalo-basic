/**
 * Core/LegacyReload.cjs
 *
 * Shim thay thế cho core/loader/loaderCommand.js gốc của NKNP — dùng bởi các
 * lệnh port sang (vd cmd.js) để tải lại 1 command lúc đang chạy. Vì ESM
 * không có require.cache để xoá, ta dùng "cache-busting" query string khi
 * import() lại file.
 *
 * Lưu ý: đây là bản rút gọn, chỉ hỗ trợ reload theo tên file — không tự
 * cài npm package còn thiếu như bản gốc (EMPHAT đã tự cài đủ dependency lúc
 * khởi động qua ensureDependencies() trong zalo.js).
 */
const path = require("path");
const { pathToFileURL } = require("url");

async function loadCommands(commandName = null) {
  try {
    const commandsDir = path.join(__dirname, "Commands");

    if (!commandName) {
      return { status: true, restart: false, note: "Dùng !restart để tải lại toàn bộ lệnh." };
    }

    const fileName = `${commandName.replace(/\.js$/, "")}.js`;
    const filePath = path.join(commandsDir, fileName);
    const mod = await import(`${pathToFileURL(filePath).href}?update=${Date.now()}`);
    const cmd = mod.default;

    if (!cmd || !cmd.name) {
      return { status: false, error: `Không tìm thấy export hợp lệ trong ${fileName}` };
    }

    const bot = global.__NKNP_BOT__;
    if (bot) {
      bot.commands.set(cmd.name, cmd);
      for (const alias of cmd.aliases || []) bot.aliases.set(alias, cmd.name);
      if (global.client?.commands) {
        global.client.commands.set(cmd.name, {
          config: {
            name: cmd.name,
            aliases: cmd.aliases || [],
            version: cmd.version,
            role: cmd.role,
            author: cmd.author,
            description: cmd.description,
            category: cmd.group,
            cooldowns: cmd.cooldown,
          },
          run: cmd.run,
        });
      }
    }

    return { status: true, restart: false };
  } catch (err) {
    return { status: false, error: err?.message || String(err) };
  }
}

module.exports = loadCommands;
