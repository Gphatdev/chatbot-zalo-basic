<div align="center">

# 🤖 Chatbot-zalo-basic — HNNP STUDIO

### Hệ thống Zalo Bot hợp nhất — nền hệ thống mạnh + kho lệnh phong phú

Bot Zalo thời gian thực, hợp nhất từ 2 framework:
**nền hệ thống** (đăng nhập QR, auto-reconnect, database, rental-guard, dashboard)
**+ kho lệnh phong phú** (Free Fire, banking, key, mini-game, media...)
thành một hệ thống duy nhất, thương hiệu **HNNP STUDIO**.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Module](https://img.shields.io/badge/Module-ESM-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Commands](https://img.shields.io/badge/Commands-63-blueviolet?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

</div>

---

## 📑 Mục lục

* [Giới thiệu](#-giới-thiệu)
* [Chatbot-zalo-basic được ghép từ đâu?](#-nknp-v3-được-ghép-từ-đâu)
* [Tính năng](#-tính-năng)
* [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
* [Cài đặt](#-cài-đặt)
* [Cấu hình](#️-cấu-hình)
* [Khởi chạy](#-khởi-chạy)
* [Danh sách lệnh](#-danh-sách-lệnh)
* [Cấu trúc dự án](#-cấu-trúc-dự-án)
* [Cơ chế Legacy Bridge (kỹ thuật)](#-cơ-chế-legacy-bridge-kỹ-thuật)
* [Việc cần kiểm tra thêm](#️-việc-cần-kiểm-tra-thêm)
* [Lưu ý bảo mật](#-lưu-ý-bảo-mật)
* [Tác giả / Credit](#-tác-giả--credit)

---

## 📖 Giới thiệu

**Chatbot-zalo-basic** là bản hợp nhất của 2 dự án bot Zalo mà bạn cung cấp:

| Nguồn | Ưu thế được giữ lại |
|---|---|
| **EMPHAT (BOT-ZALO)** | Hệ thống lõi: đăng nhập QR + lưu session, auto-reconnect, database (sql.js), `CommandLoader`/`CommandRouter`, rental-guard (chặn box hết hạn thuê), unknown-command guard, dashboard web, banner khởi động |
| **NKNP (botzalo2026)** | Kho ~50 lệnh phong phú: chấm điểm Free Fire (`td`, `tdlg`, `autotd`), hệ thống ngân hàng/nạp lượt (`luotdung`, `napluot`, `stk`, `tt`), hệ thống key (`key`), mini-game (`taixiu`), tiện ích media (`autodown`, `girltt`, `vdgirl`), quản trị nhóm (`kickall`, `capnhom`, `admin`)... |

Kết quả: **nền hệ thống của EMPHAT được giữ nguyên 100%**, còn **~44 lệnh riêng biệt của NKNP được chuyển đổi và ghép vào**, chạy chung một bot, một database, một dashboard, một banner khởi động — tất cả mang tên **HNNP STUDIO**.

## 🧩 Chatbot-zalo-basic được ghép từ đâu?

Vì 2 dự án viết theo 2 kiểu code khác nhau (EMPHAT dùng ESM + `export default {...}`, NKNP dùng CommonJS + `module.exports.config/run`), việc ghép **không phải** là copy–paste thủ công từng dòng, mà dùng một **lớp cầu nối (Legacy Bridge)**:

* `Core/LegacyBridge.js` — biến 1 lệnh kiểu NKNP thành 1 lệnh chuẩn của EMPHAT, **giữ nguyên 100% logic bên trong**, chỉ đổi phần khai báo bên ngoài.
* `Core/LegacySystem.js` — dựng lại cơ chế `onReply` / `handleEvent` mà nhiều lệnh NKNP cần (vd lệnh `key`, `stk`, `luotdung` hỏi–đáp qua reply tin nhắn).
* `Utils/LegacyDb.cjs` + `Utils/LegacyControllers.cjs` — database riêng (SQLite qua `better-sqlite3`) cho phần `Users`/`Threads` mà các lệnh NKNP cần, **tách biệt** với database chính của EMPHAT để không ảnh hưởng lẫn nhau.
* 44 file lệnh trong `Core/Commands/` có ghi chú đầu file **`[PORT TỪ NKNP]`** — đây là các lệnh được tự động chuyển đổi, logic gốc giữ nguyên vẹn.

6 lệnh bị trùng tên giữa 2 bên (`anti`, `id`, `kick`, `menu`, `thuebot`, `uptime`) — **giữ bản của EMPHAT** vì chúng đã tích hợp sâu với hệ thống rental-guard/dashboard. Bản gốc NKNP của các lệnh này vẫn còn nguyên trong file zip gốc nếu bạn muốn so sánh/thay thế sau.

## ✨ Tính năng

**Hệ thống (từ EMPHAT):**
- Đăng nhập QR, tự lưu session (lần sau không cần quét lại)
- Auto-reconnect khi mất mạng (backoff tăng dần, tối đa 12 lần thử)
- Database sql.js (groups/users/settings/command_stats)
- Rental-guard: box chưa thuê / hết hạn sẽ bị chặn lệnh, có cảnh báo
- Unknown-command guard: gõ sai lệnh → hiện bảng trạng thái bot thay vì im lặng
- Dashboard web (chỉ đọc, không lộ session/cookie)
- Banner khởi động premium (ASCII rainbow + khung thông tin)

**Lệnh (từ NKNP, port sang):**
- Free Fire: chấm điểm custom, bảng xếp hạng, check thông tin acc (`td`, `tdlg`, `autotd`, `checkff`)
- Ngân hàng / nạp lượt: quét QR chuyển khoản, cộng lượt tự động (`stk`, `luotdung`, `napluot`, `money`, `setmoney`, `daily`)
- Hệ thống key/license (`key`)
- Quản trị nhóm: kick hàng loạt, gán nhóm quyền, danh sách quản trị viên (`kickall`, `capnhom`, `admin`, `adduser`)
- Mini-game: tài xỉu (`taixiu`)
- Media: tải video/audio, tạo ảnh ghép đôi, hiệu ứng (`autodown`, `girltt`, `vdgirl`, `ghepdoi`, `hon`)
- Tiện ích: GPT chat (`gpt`), gửi card liên hệ (`sendcard`), reload cấu hình (`reloadconfig`), đổi prefix theo box (`setprefix`)...

## 💻 Yêu cầu hệ thống

- Node.js **>= 20**
- npm

## 📦 Cài đặt

```bash
cd NKNP-V3
npm install
```

`npm install` sẽ cài toàn bộ dependency của cả 2 bên (canvas, sharp, better-sqlite3, moment-timezone, zca-js, zca-mt...). Một vài package cần biên dịch native (canvas, sharp, better-sqlite3) — nếu máy thiếu công cụ build, xem hướng dẫn cài `build-essential`/`python3` cho hệ điều hành tương ứng.

## ⚙️ Cấu hình

Chatbot-zalo-basic đọc cấu hình từ **2 nguồn**, hợp nhất tại `App/Config.js`:

1. **`.env`** (bắt buộc, có validate) — copy từ `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Điền `BOT_NAME`, `BOT_PREFIX`, `OWNER_ZALO_ID` (có thể để trống lần đầu — log sẽ in UID sau khi đăng nhập).

2. **`config.yml`** (tuỳ chỉnh nhanh, không cần restart validate) — chứa các trường mà lệnh NKNP cần:
   ```yaml
   admin_bot:
     - "UID_CUA_BAN"
   support_bot:
     - "UID_HO_TRO"
   allow_private_command: true
   default_money: 0
   ```

Khi 2 nguồn trùng khoá (vd tên bot, prefix), **`.env` được ưu tiên**.

## 🚀 Khởi chạy

```bash
npm start
```

Lần đầu chạy sẽ hiện mã QR trong terminal (và lưu ra `qr.png`) — dùng app Zalo quét để đăng nhập. Từ lần sau, session được lưu tại `App/Session.json`, không cần quét lại trừ khi bị đăng xuất.

## 📋 Danh sách lệnh

Gõ `!menu` (hoặc `!help`) trong Zalo sau khi bot chạy để xem đầy đủ danh sách lệnh kèm mô tả, phân loại theo nhóm. Tổng cộng bot hiện có **63 lệnh** (19 lệnh hệ thống gốc của EMPHAT + 44 lệnh port từ NKNP).

## 🗂 Cấu trúc dự án

```
NKNP-V3/
├── App/                     # Lõi hệ thống (EMPHAT) — Config/Database/Session/Adapter/BotInstance
├── Core/
│   ├── CommandLoader.js     # Tự động nạp lệnh trong Core/Commands
│   ├── CommandRouter.js     # Định tuyến lệnh -> hàm xử lý
│   ├── LegacyBridge.js      # ⭐ Lớp cầu nối NKNP -> EMPHAT
│   ├── LegacySystem.js      # ⭐ Cơ chế onReply/handleEvent cho lệnh NKNP
│   ├── LegacyReload.cjs     # Shim reload lệnh (thay core/loader/loaderCommand cũ)
│   └── Commands/            # 63 lệnh — file có [PORT TỪ NKNP] là lệnh được chuyển đổi
├── Handlers/                # Xử lý message/reaction/undo/group event + rental-guard
├── Utils/
│   ├── Logger.js            # Banner + log màu (bản nâng cấp: thêm infoBox kiểu NKNP)
│   ├── LegacyDb.cjs         # Database SQLite riêng cho Users/Threads (lệnh NKNP)
│   ├── LegacyControllers.cjs
│   ├── LegacyUtils.cjs      # Hàm tiện ích gốc của NKNP (QR terminal, cache tin nhắn...)
│   └── LegacyCommandGroups.cjs
├── assets/                  # Dữ liệu JSON cho 1 số lệnh media (girl.json, vdgirl.json...)
├── config.yml                # Cấu hình kiểu NKNP (admin/support/prefix...)
├── .env.example
└── zalo.js                   # Entry point
```

## 🔧 Cơ chế Legacy Bridge (kỹ thuật)

Dành cho bạn (hoặc dev khác) muốn thêm/sửa lệnh sau này:

- **Thêm lệnh kiểu EMPHAT mới**: tạo file trong `Core/Commands/`, `export default { name, run(ctx) {...} }` như bình thường — không cần quan tâm gì tới LegacyBridge.
- **Thêm lệnh kiểu NKNP (module.exports.config/run) mới**: đặt file gốc vào một thư mục riêng rồi chạy lại codemod, hoặc tự bọc thủ công bằng `wrapLegacyCommand()`:
  ```js
  import { wrapLegacyCommand } from "../LegacyBridge.js";
  const config = { name: "vidu", role: 0, cooldowns: 3 };
  const run = async ({ args, event, api, Users, Threads }) => { /* logic cũ */ };
  export default wrapLegacyCommand(config, run);
  ```
- **`api`** bên trong lệnh NKNP chính là **instance zca-mt thật** (`adapter.raw`) — gọi được mọi method gốc (`api.sendMessage`, `api.getGroupInfo`, `api.findUser`...).
- **`Users`/`Threads`** hoạt động y hệt bản gốc NKNP (`getData`, `setData`, `createData`...), lưu vào `Data/legacy/nknp-legacy.db`.
- **`global.config`/`global.users`/`global.client`** được dựng sẵn ngay khi bot khởi động (`initLegacyGlobals()` trong `zalo.js`) — các lệnh cũ đọc `global.config.admin_bot` v.v. vẫn hoạt động bình thường.

## ⚠️ Việc cần kiểm tra thêm

Đây là bản ghép **đã kiểm thử tự động** (cú pháp sạch 100%, nạp được 63/63 lệnh, banner/config/database chạy đúng qua test thực tế), nhưng **chưa test được với tài khoản Zalo thật** (môi trường tạo file này không truy cập được server Zalo). Trước khi dùng cho khách hàng thật, bạn nên:

1. Chạy `npm start`, quét QR đăng nhập thật, thử vài lệnh cơ bản (`!menu`, `!id`, `!ping`).
2. Test kỹ các lệnh có luồng **reply** (`key`, `stk`, `luotdung`, `test` → gõ `!testreply` để kiểm tra nhanh cơ chế onReply).
3. Với lệnh Free Fire (`td`, `tdlg`, `autotd`) — kiểm tra `Core/Commands/ffrank/api.js` (API Garena) vẫn hoạt động, vì đây là API bên thứ 3 có thể đổi endpoint theo thời gian.
4. Kiểm tra thư viện `zca-mt` (dùng cho hệ thống lõi) và `zca-js` (dùng cho các lệnh port) có tương thích method surface với nhau không — cả 2 đều được cài trong `package.json`, nếu 1 method nào đó báo lỗi "not a function", khả năng cao là khác biệt API giữa 2 bản.
5. Điền UID admin/support thật vào `config.yml` trước khi giao cho khách dùng.

## 🔐 Lưu ý bảo mật

- **Không** commit file `.env`, `App/Session.json`, `qr.png`, hay thư mục `Data/` lên git công khai — chứa session đăng nhập thật.
- Dashboard (`server.js`) chỉ đọc, không hiển thị cookie/session, nhưng vẫn nên đặt sau reverse proxy có xác thực nếu deploy public.
- Database `Data/legacy/nknp-legacy.db` chứa số dư/lượt của user — backup định kỳ.

## 👤 Tác giả / Credit

**HNNP STUDIO** (Phát) — hợp nhất và vận hành.
Nền hệ thống kế thừa từ **EMPHAT STUDIO (BOT-ZALO)**. Kho lệnh kế thừa từ dự án **NKNP (botzalo2026)**, credit gốc: ShinTHL09, GwenDev và các tác giả lệnh liên quan (giữ nguyên trong `author` của từng lệnh port).
