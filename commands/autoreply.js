"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../data/schedules.json");
const schedules = new Map();
let nextID = 1;
let currentApi = null;

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({
      nextID,
      schedules: [...schedules.values()].map(({ id, threadID, message, intervalMs, label, createdBy }) =>
        ({ id, threadID, message, intervalMs, label, createdBy }))
    }, null, 2));
  } catch {}
}

function parseInterval(amount, unit) {
  const n = Number.parseInt(amount, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = {
    s: 1000, sec: 1000, "ث": 1000, "ثانية": 1000,
    m: 60000, min: 60000, "د": 60000, "دقيقة": 60000,
    h: 3600000, hour: 3600000, "س": 3600000, "ساعة": 3600000,
    d: 86400000, day: 86400000, "ي": 86400000, "يوم": 86400000
  };
  return units[String(unit || "").toLowerCase()] * n || null;
}

function formatMs(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} ثانية`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعة`;
  return `${Math.floor(seconds / 86400)} يوم`;
}

function start(entry, api) {
  entry.timer = setInterval(() => {
    entry.nextAt = Date.now() + entry.intervalMs;
    Promise.resolve(api.sendMessage(entry.message, entry.threadID)).catch(() => {});
  }, entry.intervalMs);
  entry.timer.unref?.();
  entry.nextAt = Date.now() + entry.intervalMs;
}

function restore(api) {
  currentApi = api;
  try {
    if (!fs.existsSync(FILE)) return;
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    nextID = data.nextID || 1;
    for (const saved of data.schedules || []) {
      if (!saved.id || !saved.threadID || !saved.message || !saved.intervalMs) continue;
      const entry = { ...saved, timer: null, nextAt: null };
      start(entry, api);
      schedules.set(entry.id, entry);
    }
  } catch {}
}

module.exports = {
  name: "autoreply",
  aliases: ["auto", "timer"],
  description: "جدولة رسائل تلقائية كل فترة زمنية (للمشرف فقط).",
  usage: [
    "-autoreply add <مقدار> <وحدة> <الرسالة>",
    "-autoreply list",
    "-autoreply stop <ID>",
    "-autoreply stopall",
    "الوحدات: s/ث، m/د، h/س، d/ي — الحد الأدنى 30 ثانية."
  ].join("\n"),
  category: "Utility",
  groupOnly: true,
  adminOnly: true,
  _restoreSchedules: restore,

  async execute({ api, event, args }) {
    if (currentApi !== api) currentApi = api;
    const prefix = require("../config.json").prefix;
    const threadID = event.threadID;
    const sub = String(args[0] || "").toLowerCase();

    if (sub === "add") {
      const intervalMs = parseInterval(args[1], args[2]);
      const message = args.slice(3).join(" ").trim();
      if (!intervalMs || !message) {
        return api.sendMessage(`❌ الاستخدام:\n${prefix}autoreply add <مقدار> <وحدة> <الرسالة>`, threadID);
      }
      if (intervalMs < 30000) return api.sendMessage("❌ الحد الأدنى 30 ثانية.", threadID);
      if (intervalMs > 7 * 86400000) return api.sendMessage("❌ الحد الأقصى 7 أيام.", threadID);
      if ([...schedules.values()].filter(s => s.threadID === threadID).length >= 10) {
        return api.sendMessage("❌ الحد الأقصى 10 جداول لهذه المجموعة.", threadID);
      }
      const entry = {
        id: nextID++, threadID, message, intervalMs,
        label: `${args[1]}${args[2]}`, createdBy: event.senderID,
        timer: null, nextAt: null
      };
      start(entry, api);
      schedules.set(entry.id, entry);
      save();
      return api.sendMessage(`✅ تم إنشاء الجدول #${entry.id}\n⏱️ كل ${formatMs(intervalMs)}\n📩 ${message}\n\nلإيقافه: ${prefix}autoreply stop ${entry.id}`, threadID);
    }

    const entries = [...schedules.values()].filter(s => s.threadID === threadID);
    if (sub === "list") {
      if (!entries.length) return api.sendMessage(`📭 لا توجد جداول نشطة.\nأضف واحداً عبر ${prefix}autoreply add`, threadID);
      return api.sendMessage(
        `🔁 الجداول النشطة (${entries.length})\n` +
        entries.map(s => `#${s.id} — كل ${formatMs(s.intervalMs)} — ${s.message}`).join("\n"),
        threadID
      );
    }
    if (sub === "stop") {
      const id = Number.parseInt(args[1], 10);
      const entry = schedules.get(id);
      if (!entry || entry.threadID !== threadID) return api.sendMessage(`❌ لا يوجد جدول #${args[1]}.`, threadID);
      clearInterval(entry.timer);
      schedules.delete(id);
      save();
      return api.sendMessage(`✅ تم إيقاف الجدول #${id}.`, threadID);
    }
    if (sub === "stopall") {
      for (const entry of entries) {
        clearInterval(entry.timer);
        schedules.delete(entry.id);
      }
      save();
      return api.sendMessage(`✅ تم إيقاف جميع الجداول (${entries.length}).`, threadID);
    }
    return api.sendMessage(`📖 الاستخدام:\n${this.usage}`, threadID);
  }
};