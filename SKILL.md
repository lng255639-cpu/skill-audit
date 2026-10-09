---
name: skill-audit
description: |
  盤點並整理已安裝的 skills：掃描個人 skills、專案 skills、plugin skills 與內建 skills，統計對話紀錄裡實際用過幾次，列出「功能重疊／類似」的群組、「沒什麼用或壞掉」的 skill，最後問使用者要不要整理（封存、停用 plugin、合併、修壞掉的資料夾）。
  觸發時機：使用者說「整理 skills」「看一下我裝了哪些 skill」「skill 太多了」「哪些 skill 重複」「哪些 skill 沒用」「清理 skill」「skill 健檢」，或輸入 /skill-audit。
  不要觸發：要新建或改寫某個 skill（用 skill-creator）、只問某一個 skill 怎麼用、要安裝新的 plugin。
user-invocable: true
---

# skill-audit：skills 盤點與整理

目標：讓使用者一眼看懂「裝了什麼、哪些重複、哪些沒在用或壞掉」，然後**問過才動手**整理。

## 步驟 1：盤點

跑盤點腳本（目前在專案資料夾的話，把專案路徑當參數傳進去，才會連專案 skills 一起掃）：

```bash
node ~/.claude/skills/skill-audit/scripts/inventory.mjs [專案路徑] > "$TMP/skill-inventory.json"
```

輸出 JSON 內容：
- `skills[]`：每個 skill 的 `id`、`source`（personal / project / plugin:xxx）、`description`、檔案數、大小、最後修改日、`uses`（對話紀錄裡被叫用的次數）、`linkedTo`（junction／symlink 的實際位置）
- `plugins[]`：已安裝的 plugin
- `otherUsage`：內建 skill（anthropic-skills:*、artifact-design 等）的使用次數
- `issues[]`：壞掉的東西（SKILL.md 多包一層、沒有 SKILL.md、殘留壓縮檔、沒有 description、重名、壞掉的連結）
- `transcriptsSince`：使用次數統計的起算日。紀錄只涵蓋這天之後，要在報告裡講清楚

**內建 skills**（anthropic-skills:*、artifact-*、dataviz、schedule、code-review 等）不在磁碟上，腳本掃不到。從本次對話 system-reminder 的可用 skill 清單補進來，標成「內建（不可移除）」。它們只用來比對重疊，不列入刪除建議。

## 步驟 2：分析

讀每個 skill 的 description（必要時讀 SKILL.md 開頭幾十行），自己判斷，不要只看名字。

### A. 功能類似／重疊
依用途分群，每群講清楚：
- 群組主題（例：「去 AI 味／潤稿」「資安掃描」「比價」）
- 成員，各自差在哪（語言、範圍、觸發條件）
- 判斷：**真重複**（建議留一個）、**互補**（範圍不同，可共存，例如中英文版、台灣站／國際站），或**可合併**（兩個 skill 合成一個，用參數區分）
- 建議留哪個、理由（用過次數、維護程度、功能完整度）

常見重疊模式：同一功能的中英文版、個人 skill 和內建 skill 重複（例：個人 humanizer 和 anthropic-skills:humanizer）、plugin 帶進來的 skill 和既有 skill 撞功能、同一個工作流拆成兩個幾乎一樣的 skill。

### B. 沒什麼用／該處理
分三級，每個都附理由：
1. **壞掉**（issues 裡的東西）：根本不會被載入，要修就是修，不修就刪。最優先。
2. **可能沒用**：`uses` 是 0 且安裝已久、描述跟使用者的專案或習慣沒關係（參考使用者最近的專案資料夾）、被另一個 skill 完全涵蓋、plugin 帶進來一大包但只有少數用得到。
3. **佔空間**：大小特別大的（例：上 MB 的 assets、evals），說明大在哪。

注意：
- `uses` 只是參考。很多 skill 是 Claude 讀 description 自動用、或很久才用一次（比價、找工作），0 次不代表沒用。要寫「N 天內 0 次」，別直接說沒用。
- Plugin 裡的 skill 不能單獨刪，只能整個 plugin 停用或移除。評估時以 plugin 為單位：「這個 plugin 20 個 skill，你用過幾個」。
- 使用者自己寫的 skill（例如用 junction／symlink 連到別的資料夾、或資料夾裡有 .git 的）特別小心，可能還在開發中。

## 步驟 3：報告

用使用者的語言，在對話裡直接列出（不必做成檔案），結構：

1. **總覽**：個人 N 個、plugin N 個（含 M 個 skill）、內建 N 個；統計期間。
2. **壞掉要修的**：路徑、問題、建議修法。
3. **功能類似的群組**：每群一小段，結論寫清楚（留哪個／都留／合併）。
4. **可能沒什麼用的**：清單＋理由＋使用次數。
5. **建議動作清單**：編號，每條一個具體動作。

## 步驟 4：問要不要整理

報告完，用 AskUserQuestion（multiSelect: true）讓使用者勾要執行哪些動作，選項就是步驟 3 的建議動作（最多 4 個選項一題，多的話分多題或合併同類）。**沒問過不准動任何檔案。**

使用者選完再執行，可用的動作：

| 動作 | 做法 |
|---|---|
| 封存個人 skill | 移到 `~/.claude/skills-archive/<名稱>-<日期>/`，**不要直接刪**。要還原時搬回來就好 |
| 修多包一層的資料夾 | 把內層搬到 `~/.claude/skills/<名稱>/`，確認 SKILL.md 在第一層；原本的空殼移到 archive |
| 清殘留壓縮檔 | 移到 archive |
| 停用 plugin | `claude plugin disable <plugin@marketplace>`（可逆） |
| 移除 plugin | `claude plugin uninstall <plugin@marketplace>`，執行前再確認一次 |
| 合併兩個 skill | 只產出合併後的 SKILL.md 草稿給使用者看，同意後才寫入，舊的進 archive |
| 改 description 讓觸發不撞 | 改 description 的「觸發時機／不要觸發」，讓兩個 skill 分工清楚 |

規則：
- junction／symlink（`linkedTo` 有值）只移除連結本身，**絕不動目標資料夾**。PowerShell 用 `(Get-Item <連結>).Delete()` 或 `cmd /c rmdir <連結>`，不要用 `Remove-Item -Recurse`。
- 永遠不要 hard delete。全部進 archive，最後告訴使用者 archive 在哪、確定不要了可以自己清。
- 內建 skill 不能動，只能建議「個人版跟內建版重複，可以封存個人版」。
- 執行完重跑一次盤點腳本，回報前後差異（少了幾個 skill、issues 是否清空），並提醒：skill 變動要**開新對話**才會生效。
