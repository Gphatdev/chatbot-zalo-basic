// Định nghĩa các "nhóm lệnh" dùng cho tính năng cấm sử dụng theo nhóm
// (lệnh .capnhom). Muốn thêm/bớt lệnh vào 1 nhóm, hoặc thêm nhóm mới,
// chỉ cần sửa object bên dưới — không cần đụng vào file nào khác.
const COMMAND_GROUPS = {
  "Anti": ["anti"],
  "TĐ": ["td", "tdlg"],
  "Giải Trí": ["girl", "girltt", "ghepdoi", "hon", "tile", "vdgirl", "qrheart"],
  "Kiếm Tiền": ["daily", "money", "pay", "setmoney"],
  "Game": ["baucua", "taixiu"],
  "Tiện Ích": ["cdm", "id", "itik", "fbin4", "boxinfo", "sendcard", "gpt"]
};

function getGroupNames() {
  return Object.keys(COMMAND_GROUPS);
}

function findGroupOfCommand(commandName) {
  for (const [groupName, commands] of Object.entries(COMMAND_GROUPS)) {
    if (commands.includes(commandName)) return groupName;
  }
  return null;
}

module.exports = { COMMAND_GROUPS, getGroupNames, findGroupOfCommand };
