#!/usr/bin/env node
// 盤點已安裝的 skills：個人 skills、專案 skills、plugin skills，
// 並從對話紀錄統計每個 skill 被叫用的次數。輸出 JSON 到 stdout。
// 用法：node inventory.mjs [專案路徑]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const CLAUDE = path.join(HOME, ".claude");
const projectDir = process.argv[2];

function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (m) {
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const kv = lines[i].match(/^([\w-]+):\s*(.*)$/);
      if (!kv) continue;
      let [, k, v] = kv;
      if (v === "|" || v === ">" || v === "|-" || v === ">-" || v === "") {
        const buf = [];
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) buf.push(lines[++i].trim());
        v = buf.join(" ");
      }
      fm[k] = v.replace(/^["']|["']$/g, "");
    }
  }
  return { fm, bodyLines: text.split(/\r?\n/).length };
}

function dirStats(dir) {
  let files = 0, bytes = 0, newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const s = fs.statSync(p);
        files++; bytes += s.size; newest = Math.max(newest, s.mtimeMs);
      }
    }
  };
  try { walk(dir); } catch {}
  return { files, sizeKB: Math.round(bytes / 1024), modified: newest ? new Date(newest).toISOString().slice(0, 10) : null };
}

const skills = [];
const issues = [];

function scanSkillRoot(root, source, prefix = "") {
  if (!fs.existsSync(root)) return;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    // junction / symlink 也要當資料夾看
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) { try { isDir = fs.statSync(p).isDirectory(); } catch { issues.push({ type: "broken-link", path: p, note: "連結指向不存在的位置" }); continue; } }
    if (!isDir) {
      if (/\.(zip|tar|gz|7z|rar)$/i.test(e.name)) issues.push({ type: "leftover-archive", path: p, note: "skills 資料夾裡的壓縮檔，Claude 不會載入" });
      continue;
    }
    const skillMd = path.join(p, "SKILL.md");
    if (!fs.existsSync(skillMd)) {
      // 常見錯誤：解壓多包一層（foo/foo/SKILL.md）
      const nested = fs.readdirSync(p, { withFileTypes: true })
        .filter((x) => x.isDirectory())
        .map((x) => path.join(p, x.name))
        .find((x) => fs.existsSync(path.join(x, "SKILL.md")) || fs.existsSync(path.join(x, "skills")));
      issues.push({
        type: nested ? "nested-folder" : "no-skill-md",
        path: p,
        note: nested ? `SKILL.md 在下一層 (${nested})，Claude 不會載入這個 skill` : "沒有 SKILL.md，不會被載入",
      });
      continue;
    }
    const { fm, bodyLines } = readFrontmatter(skillMd);
    const name = fm.name || e.name;
    skills.push({
      id: prefix ? `${prefix}:${name}` : name,
      name,
      source,
      dir: p,
      linkedTo: e.isSymbolicLink() ? fs.realpathSync(p) : null,
      description: fm.description || "",
      userInvocable: fm["user-invocable"] ?? null,
      skillMdLines: bodyLines,
      ...dirStats(p),
    });
    if (!fm.description) issues.push({ type: "no-description", path: skillMd, note: "沒有 description，Claude 很難判斷何時觸發" });
    if (fm.name && fm.name !== e.name) issues.push({ type: "name-mismatch", path: p, note: `資料夾名 ${e.name} 與 name: ${fm.name} 不同` });
  }
}

// 1. 個人 skills
scanSkillRoot(path.join(CLAUDE, "skills"), "personal");

// 2. 專案 skills
if (projectDir) scanSkillRoot(path.join(projectDir, ".claude", "skills"), "project");

// 3. plugin skills
const pluginsFile = path.join(CLAUDE, "plugins", "installed_plugins.json");
const plugins = [];
if (fs.existsSync(pluginsFile)) {
  const data = JSON.parse(fs.readFileSync(pluginsFile, "utf8"));
  for (const [key, entries] of Object.entries(data.plugins || {})) {
    const entry = entries[entries.length - 1];
    const pluginName = key.split("@")[0];
    plugins.push({ id: key, version: entry.version, installedAt: entry.installedAt?.slice(0, 10), path: entry.installPath });
    scanSkillRoot(path.join(entry.installPath, "skills"), `plugin:${key}`, pluginName);
  }
}

// 4. 對話紀錄裡的使用次數
const usage = {};
const bump = (k) => { usage[k] = (usage[k] || 0) + 1; };
let transcripts = 0, oldest = null;
const projRoot = path.join(CLAUDE, "projects");
const walkJsonl = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkJsonl(p);
    else if (e.name.endsWith(".jsonl")) {
      transcripts++;
      const mt = fs.statSync(p).mtimeMs;
      if (!oldest || mt < oldest) oldest = mt;
      const text = fs.readFileSync(p, "utf8");
      for (const m of text.matchAll(/"name":"Skill","input":\{"skill":"([^"]+)"/g)) bump(m[1]);
      for (const m of text.matchAll(/<command-name>\/?([^<\s]+)<\/command-name>/g)) bump(m[1]);
    }
  }
};
if (fs.existsSync(projRoot)) walkJsonl(projRoot);

for (const s of skills) {
  s.uses = (usage[s.id] || 0) + (s.id !== s.name ? usage[s.name] || 0 : 0);
}

// 5. 重名
const byName = {};
for (const s of skills) (byName[s.name] ||= []).push(s.id + " @ " + s.source);
for (const [n, list] of Object.entries(byName)) if (list.length > 1) issues.push({ type: "duplicate-name", name: n, note: list.join(" / ") });

console.log(JSON.stringify({
  scannedAt: new Date().toISOString(),
  transcriptCount: transcripts,
  transcriptsSince: oldest ? new Date(oldest).toISOString().slice(0, 10) : null,
  plugins,
  skills,
  otherUsage: Object.fromEntries(Object.entries(usage).filter(([k]) => !skills.some((s) => s.id === k || s.name === k))),
  issues,
}, null, 2));
