"use strict";
const fs   = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../data/rules.json");

function _load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch { return {}; }
}
function _save(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

module.exports = {
  name: "rules",
  aliases: ["rule", "قوانين", "قانون"],
  description: "إدارة قوانين المجموعة.",
  usage: [
    "-rules                 — عرض القوانين",
    "-rules add <نص>        — إضافة قانون",
    "-rules remove <رقم>    — حذف قانون",
    "-rules clear           — مسح جميع القوانين",
    "-rules set <رقم> <نص>  — تعديل قانون",
  ].join("\n"),
  category: "Admin",
  groupOnly: true,

  async execute({ api, event, args }) {
    const { threadID, senderID } = event;
    const config  = require("../config.json");
    const botAdmins  = config.bot.adminIDs || [];
    const isAdmin = botAdmins.includes(String(senderID));

    const sub = (args[0] || "").toLowerCase();
    const data = _load();
    if (!data[threadID]) data[threadID] = [];
    const rules = data[threadID];

    // ── view ──────────────────────────────────────────────────────────────────
    if (!sub || sub === "list" || sub === "show") {
      if (!rules.length) {
        return api.sendMessage(
          "📋 لا توجد قوانين مُضافة بعد.\n" +
          (isAdmin ? `أضف قانوناً: ${config.prefix}rules add <نص>` : ""),
          threadID
        );
      }
      const lines = rules.map((r, i) => `${i + 1}. ${r}`);
      return api.sendMessage(
        `📋 قوانين المجموعة (${rules.length})\n━━━━━━━━━━━━━━━━\n${lines.join("\n")}`,
        threadID
      );
    }

    // ── operations below require admin ────────────────────────────────────────
    if (!isAdmin) {
      // Check thread admin too
      try {
        const info = await api.getThreadInfo(threadID);
        const adminIDs = (info.adminIDs || []).map(a => a.id || a);
        if (!adminIDs.includes(String(senderID))) {
          return api.sendMessage("⛔ إدارة القوانين للمشرفين فقط.", threadID);
        }
      } catch {
        return api.sendMessage("⛔ إدارة القوانين للمشرفين فقط.", threadID);
      }
    }

    // ── add ───────────────────────────────────────────────────────────────────
    if (sub === "add") {
      const text = args.slice(1).join(" ").trim();
      if (!text) return api.sendMessage(`❌ مثال: ${config.prefix}rules add لا للإزعاج`, threadID);
      if (rules.length >= 20) return api.sendMessage("❌ الحد الأقصى 20 قانوناً.", threadID);
      rules.push(text.slice(0, 300));
      _save(data);
      return api.sendMessage(`✅ تمت إضافة القانون رقم ${rules.length}:\n${text}`, threadID);
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === "remove" || sub === "delete") {
      const idx = parseInt(args[1]) - 1;
      if (isNaN(idx) || idx < 0 || idx >= rules.length) {
        return api.sendMessage(`❌ رقم غير صحيح. عدد القوانين: ${rules.length}`, threadID);
      }
      const removed = rules.splice(idx, 1)[0];
      _save(data);
      return api.sendMessage(`✅ تم حذف القانون ${idx + 1}:\n${removed}`, threadID);
    }

    // ── set / edit ────────────────────────────────────────────────────────────
    if (sub === "set" || sub === "edit") {
      const idx = parseInt(args[1]) - 1;
      const text = args.slice(2).join(" ").trim();
      if (isNaN(idx) || idx < 0 || idx >= rules.length || !text) {
        return api.sendMessage(`❌ مثال: ${config.prefix}rules set 2 النص الجديد`, threadID);
      }
      rules[idx] = text.slice(0, 300);
      _save(data);
      return api.sendMessage(`✅ تم تعديل القانون ${idx + 1}:\n${text}`, threadID);
    }

    // ── clear ─────────────────────────────────────────────────────────────────
    if (sub === "clear") {
      data[threadID] = [];
      _save(data);
      return api.sendMessage("✅ تم مسح جميع القوانين.", threadID);
    }

    return api.sendMessage(`📖 استخدام:\n${this.usage}`, threadID);
  },
};
