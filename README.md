# skill-audit 使用說明

skill 裝多了，常會搞不清楚自己到底裝了哪些、哪幾個功能重複、哪幾個根本沒在用。這個 skill 會幫你把已安裝的 skills 盤點一遍：整理出功能類似的群組，列出沒什麼用或壞掉的，最後問你要不要整理。**沒經過你同意不會動任何檔案。**

## 安裝

需要 [Claude Code](https://claude.com/claude-code) 和 Node.js 18 以上（不用裝其他套件）。把這個 repo clone 到 Claude Code 的 skills 資料夾：

```bash
git clone https://github.com/lng255639-cpu/skill-audit.git ~/.claude/skills/skill-audit
```

Windows 的 `~` 是 `C:\Users\<你的使用者名稱>`。裝好後開新對話就能用。

## 怎麼用

在 Claude Code 新對話裡輸入：

```
/skill-audit
```

也可以直接用講的，skill 會自動觸發：

- 「幫我整理 skills」
- 「看一下我裝了哪些 skill」
- 「哪些 skill 功能重複」
- 「哪些 skill 都沒在用」
- 「skill 健檢」

在專案資料夾裡用的話，會連專案的 `.claude/skills/` 一起掃。

## 會掃哪些地方

| 來源 | 位置 | 可以整理嗎 |
|---|---|---|
| 個人 skills | `~/.claude/skills/` | 可以，移到封存資料夾 |
| 專案 skills | `<專案>/.claude/skills/` | 可以，移到封存資料夾 |
| Plugin skills | `~/.claude/plugins/` 裡已安裝的 plugin | 只能整個 plugin 停用或移除 |
| 內建 skills | Claude Code / Claude App 內建 | 不能動，只拿來比對有沒有重複 |

另外會讀 `~/.claude/projects/` 的對話紀錄，統計每個 skill 實際被用過幾次。統計只在你的電腦上跑，不會傳出去。

## 會得到什麼

```
總覽：個人 12 個、plugin 1 個（含 8 個 skill）、內建 25 個
統計期間：2026-01-01 起，共 240 份對話紀錄

壞掉要修的
- skills/meeting-notes-2.0/：SKILL.md 多包了一層，Claude 根本沒載入
- skills/meeting-notes-2.0.zip：殘留的壓縮檔

功能類似
- 潤稿：polish-zh（12 次）、rewrite-natural（0 次）
  → 高度重疊，建議留一個
- 翻譯：translate-ja（日文）、translate-ko（韓文）
  → 語言不同，可以並存

可能沒什麼用
- old-blog-helper：0 次，舊部落格平台專用，平台已經沒在用
- demo-dashboard：0 次，2.1MB（大多是範例截圖）

建議動作
1. 封存 meeting-notes-2.0 和 .zip
2. 潤稿只留 polish-zh
3. ...
```

最後會跳出選單讓你勾要做哪幾項，也可以全部不做，只看報告。

## 整理時會做什麼

| 動作 | 做法 |
|---|---|
| 封存個人／專案 skill | 移到 `~/.claude/skills-archive/<名稱>-<日期>/`，**不會直接刪**，要用時搬回來就好 |
| 修多包一層的資料夾 | 把 SKILL.md 搬回第一層，舊的空殼放進封存 |
| 清殘留壓縮檔 | 移到封存資料夾 |
| 停用 plugin | `claude plugin disable`，可以再開回來 |
| 移除 plugin | `claude plugin uninstall`，執行前會再問一次 |
| 合併兩個 skill | 先給你看合併後的 SKILL.md 草稿，你同意才寫入 |
| 改 description | 讓兩個功能接近的 skill 觸發條件分清楚，不互搶 |

用 junction 或 symlink 連過來的 skill，只會拆掉連結本身，不會碰到原本的資料夾。整理完會重新盤點一次，告訴你前後差了什麼。skill 有變動的話，要**開新對話**才會生效。

## 自己跑盤點腳本（不經過 Claude）

```bash
node ~/.claude/skills/skill-audit/scripts/inventory.mjs
```

要連專案 skills 一起掃，就把專案路徑放在最後面：

```bash
node ~/.claude/skills/skill-audit/scripts/inventory.mjs /path/to/project
```

輸出是 JSON：

| 欄位 | 內容 |
|---|---|
| `skills[]` | 每個 skill 的 id、來源、description、檔案數、大小、最後修改日、使用次數、連結目標 |
| `plugins[]` | 已安裝的 plugin 和版本 |
| `otherUsage` | 內建 skill 和斜線指令的使用次數 |
| `issues[]` | 壞掉的東西：多包一層、沒有 SKILL.md、殘留壓縮檔、沒有 description、重名、壞掉的連結 |
| `transcriptsSince` | 使用次數從哪天開始算 |

腳本只負責盤點和數次數，「哪些功能類似」、「哪些沒用」要由 Claude 讀 description 判斷，所以還是建議透過 Claude 用。

## 限制

- 使用次數只算得到還留在電腦上的對話紀錄，舊的紀錄被清掉就沒有了。
- Claude 自動觸發但沒透過 Skill 工具叫用的情況可能數不到，所以 0 次不等於沒用。比價、找工作這類久久用一次的也很正常。
- 內建 skills 不在硬碟上，是 Claude 從當下對話可用的清單補進來的，換環境（CLI、桌面 App）看到的可能不一樣。
- Plugin 裡的 skill 不能單獨移除，只能整個 plugin 一起處理。

## 檔案結構

```
skill-audit/
├── SKILL.md                ← Claude 讀的流程說明
├── README.md               ← 本說明
└── scripts/
    └── inventory.mjs       ← 盤點腳本（只需要 Node.js，不用裝套件）
```
