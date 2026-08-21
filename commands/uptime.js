"use strict";

const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../config.json");

try {
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/JetBrainsMono-Bold.ttf"), "JBMono");
} catch {}

const pad = n => String(n).padStart(2, "0");
const font = (size, bold = true) => `${bold ? "bold " : ""}${size}px JBMono, monospace`;

function rounded(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function line(ctx, y, x1, x2, color = "#21262d") {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}

function buildCard(info) {
  const W = 720, H = 412;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#30363d"; ctx.lineWidth = 1.5;
  rounded(ctx, 1, 1, W - 2, H - 2); ctx.stroke();

  ctx.fillStyle = "#161b22"; ctx.fillRect(1, 1, W - 2, 57); line(ctx, 58, 1, W - 1);
  ctx.fillStyle = "#3fb950"; ctx.beginPath(); ctx.arc(26, 29, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c9d1d9"; ctx.font = font(17); ctx.textAlign = "left";
  ctx.fillText("BROLY", 44, 36);

  const pill = "ONLINE"; ctx.font = font(10, false);
  const pw = ctx.measureText(pill).width + 18, px = W / 2 - pw / 2;
  ctx.fillStyle = "#0d2313"; rounded(ctx, px, 17, pw, 22, 4); ctx.fill();
  ctx.strokeStyle = "#2ea043"; rounded(ctx, px, 17, pw, 22, 4); ctx.stroke();
  ctx.fillStyle = "#3fb950"; ctx.textAlign = "center"; ctx.fillText(pill, W / 2, 32);
  ctx.fillStyle = "#6e7681"; ctx.font = font(12, false); ctx.textAlign = "right";
  ctx.fillText("v" + info.version, W - 18, 35);

  ctx.fillStyle = "#080d12"; ctx.fillRect(1, 59, W - 2, 88); line(ctx, 147, 1, W - 1);
  ctx.fillStyle = "#484f58"; ctx.font = font(9, false); ctx.textAlign = "center";
  ctx.fillText("U P T I M E", W / 2, 76);

  const segments = [
    [pad(info.days), "DAYS"], [pad(info.hours), "HRS"],
    [pad(info.mins), "MIN"], [pad(info.secs), "SEC"]
  ];
  const segW = 104, start = (W - segments.length * segW) / 2;
  segments.forEach(([value, label], i) => {
    const cx = start + i * segW + segW / 2;
    ctx.fillStyle = "#58a6ff"; ctx.font = font(36); ctx.textAlign = "center";
    ctx.fillText(value, cx, 127);
    ctx.fillStyle = "#484f58"; ctx.font = font(8, false); ctx.fillText(label, cx, 141);
    if (i < 3) { ctx.fillStyle = "#30363d"; ctx.font = font(26); ctx.fillText(":", start + (i + 1) * segW, 122); }
  });

  const rowY = 148, rowH = 56, half = W / 2;
  ctx.strokeStyle = "#30363d"; ctx.beginPath(); ctx.moveTo(half, rowY); ctx.lineTo(half, rowY + rowH * 4); ctx.stroke();
  const left = [
    ["RAM Usage", `${info.memMB} MB`, "#ffa657"], ["Active Groups", info.groups, "#58a6ff"],
    ["Commands", info.commands, "#bc8cff"], ["Bot Prefix", info.prefix, "#e6edf3"]
  ];
  const right = [
    ["Locked Groups", info.locked, info.locked > 0 ? "#f85149" : "#6e7681"],
    ["Admins", info.admins, "#3fb950"], ["Platform", info.platform, "#8b949e"],
    ["Node.js", process.version, "#d29922"]
  ];
  for (let row = 0; row < 4; row++) {
    const y = rowY + row * rowH;
    if (row) line(ctx, y, 1, W - 1, "#161b22");
    for (const [x, item] of [[20, left[row]], [half + 20, right[row]]]) {
      ctx.fillStyle = "#484f58"; ctx.font = font(9, false); ctx.textAlign = "left";
      ctx.fillText(item[0].toUpperCase(), x, y + 20);
      ctx.fillStyle = item[2]; ctx.font = font(20); ctx.fillText(String(item[1]), x, y + 44);
    }
  }

  line(ctx, 372, 1, W - 1);
  ctx.fillStyle = "#3d444d"; ctx.font = font(10, false); ctx.textAlign = "center";
  const now = new Date().toLocaleString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "numeric", month: "short", year: "numeric"
  });
  ctx.fillText(`${now}  •  BROLY / ${process.version}`, W / 2, 396);
  return canvas.toBuffer("image/png");
}

module.exports = {
  name: "uptime",
  aliases: ["up"],
  description: "عرض تفاصيل BROLY كصورة.",
  usage: "uptime",
  category: "General",

  async execute({ api, event, commands }) {
    const total = Math.floor(process.uptime());
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    let groups = 0, locked = 0;
    try {
      const state = require("../state");
      groups = state.groupsCache.size; locked = state.lockedThreads.size;
    } catch {}
    const info = {
      days, hours, mins, secs, memMB, groups, locked,
      commands: commands ? [...new Set(commands.values())].length : 0,
      admins: Array.isArray(config.bot.adminIDs) ? config.bot.adminIDs.length : 0,
      prefix: config.prefix, platform: os.platform(), version: config.bot.version
    };
    const tmpFile = path.join(os.tmpdir(), `uptime_${Date.now()}.png`);
    try {
      fs.writeFileSync(tmpFile, buildCard(info));
      await api.sendMessage({ body: "", attachment: fs.createReadStream(tmpFile) }, event.threadID);
    } catch {
      api.sendMessage(
        `BROLY v${info.version}\nUptime: ${days}d ${hours}h ${mins}m ${secs}s\n` +
        `RAM: ${memMB} MB  |  Groups: ${groups}  |  Commands: ${info.commands}`,
        event.threadID
      );
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
};