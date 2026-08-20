"use strict";

const fs    = require("fs");
const path  = require("path");
const https = require("https");
const logger = require("./logger");

const MAX_BACKUPS = 3;
const GH_TIMEOUT  = 15_000;

class SessionManager {
  constructor(filePath, ghToken, ghRepo) {
    this.filePath    = path.resolve(filePath);
    this.dir         = path.dirname(this.filePath);
    this.ghToken     = ghToken || "";
    this.ghRepo      = ghRepo  || "";
    this._ghSha      = "";
    this._pushing    = false;
    this._pendingPush = false; // queued push while one is in flight
  }

  _backupPath(n) {
    return this.filePath.replace(/\.json$/, `.backup${n}.json`);
  }

  _validate(data) {
    if (!Array.isArray(data))         return { valid: false, reason: "not an array" };
    if (data.length === 0)            return { valid: false, reason: "empty array" };
    if (data[0] && data[0]._README)   return { valid: false, reason: "placeholder data" };
    if (!data.some(c => c && c.key && c.value !== undefined))
                                      return { valid: false, reason: "no valid cookie entries" };
    return { valid: true };
  }

  _rotateBackups() {
    try {
      for (let i = MAX_BACKUPS; i > 1; i--) {
        const from = this._backupPath(i - 1);
        const to   = this._backupPath(i);
        if (fs.existsSync(from)) fs.copyFileSync(from, to);
      }
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this._backupPath(1));
        logger.debug("Session", "Backup rotation complete.");
      }
    } catch (e) {
      logger.warn("Session", `Backup rotation failed: ${e.message}`);
    }
  }

  load() {
    const sources = [
      { label: "primary",   file: this.filePath },
      ...([1, 2, 3].map(n => ({ label: `backup #${n}`, file: this._backupPath(n) }))),
    ];

    for (const { label, file } of sources) {
      if (!fs.existsSync(file)) continue;
      try {
        const raw  = fs.readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        const { valid, reason } = this._validate(data);
        if (!valid) { logger.warn("Session", `${label} invalid: ${reason}`); continue; }
        logger.success("Session", `Loaded ${data.length} cookies from ${label}.`);
        if (label !== "primary") {
          try { fs.copyFileSync(file, this.filePath); }
          catch { logger.warn("Session", "Could not restore primary from backup."); }
        }
        return data;
      } catch (e) {
        logger.warn("Session", `${label} corrupted: ${e.message}`);
      }
    }

    logger.fatal("Session", "All session sources are invalid or missing.");
    logger.fatal("Session", "Export fresh Facebook cookies and save as appstate.json");
    process.exit(1);
  }

  save(state) {
    const { valid, reason } = this._validate(state);
    if (!valid) { logger.warn("Session", `Refusing to save invalid state: ${reason}`); return false; }
    try {
      this._rotateBackups();
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
      logger.debug("Session", `Saved ${state.length} cookies to disk.`);
      return true;
    } catch (e) {
      logger.error("Session", `Failed to save session: ${e.message}`);
      return false;
    }
  }

  async pushToGitHub(attempt = 0) {
    if (!this.ghToken || !this.ghRepo) return;
    if (!fs.existsSync(this.filePath)) return;

    // If a push is already in flight, queue one more and bail.
    // The in-flight push will trigger another push when it finishes.
    if (this._pushing) {
      this._pendingPush = true;
      return;
    }

    this._pushing = true;
    const MAX_RETRIES = 3;
    try {
      const content = fs.readFileSync(this.filePath, "utf8");

      if (!this._ghSha) {
        const meta = await this._ghRequest("GET", `/repos/${this.ghRepo}/contents/appstate.json`);
        this._ghSha = meta.sha || "";
      }

      const body = JSON.stringify({
        message: "chore: auto-update appstate.json [skip ci]",
        content: Buffer.from(content).toString("base64"),
        sha:     this._ghSha,
      });

      const result = await this._ghRequest("PUT", `/repos/${this.ghRepo}/contents/appstate.json`, body);
      if (result.content && result.content.sha) this._ghSha = result.content.sha;
      logger.debug("Session", "Cookies pushed to GitHub successfully.");
    } catch (e) {
      this._ghSha = ""; // invalidate SHA so next push re-fetches it
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 5_000;
        logger.warn("Session", `GitHub push failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${e.message}. Retry in ${delay / 1000}s...`);
        this._pushing = false;
        await new Promise(r => setTimeout(r, delay));
        return this.pushToGitHub(attempt + 1);
      }
      logger.warn("Session", `GitHub push permanently failed: ${e.message}`);
    } finally {
      this._pushing = false;
      // Drain queued push (e.g. session refreshed while previous push was in-flight)
      if (this._pendingPush) {
        this._pendingPush = false;
        setTimeout(() => this.pushToGitHub(), 2_000);
      }
    }
  }

  async saveAndPush(state) {
    const saved = this.save(state);
    if (saved) await this.pushToGitHub();
    return saved;
  }

  _ghRequest(method, apiPath, body) {
    return new Promise((resolve, reject) => {
      const bodyBuf = body ? Buffer.from(body, "utf8") : null;
      const req = https.request({
        hostname: "api.github.com",
        path:     apiPath,
        method,
        headers: {
          "Authorization":  `token ${this.ghToken}`,
          "Accept":         "application/vnd.github.v3+json",
          "User-Agent":     "madox-bot-session/2",
          "Content-Type":   "application/json",
          ...(bodyBuf ? { "Content-Length": bodyBuf.length } : {}),
        },
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
      });
      req.setTimeout(GH_TIMEOUT, () => req.destroy(new Error("GitHub request timeout")));
      req.on("error", reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }
}

module.exports = { SessionManager };
