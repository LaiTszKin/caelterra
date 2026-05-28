# Tasks: 技能目錄重組

- Date: 2026-05-28
- Feature: 技能目錄重組

## **Task 1: 建立 skills/ 目錄並遷移技能**

Purpose: 在 repo 根目錄建立 `skills/` 目錄，將全部 42 個含 SKILL.md 的技能子目錄移至其下
Requirements: R1.1, R1.2, R1.3, R1.4
Scope: repo 根目錄的所有技能目錄
Out of scope: 非技能目錄（bin/, dist/, docs/, lib/, resources/, scripts/, test/, node_modules/）

- T1.1 [ ] **repo 根目錄** — 建立 `skills/` 目錄
  - Verify: `test -d skills/ && echo "exists"`

- T1.2 [ ] **repo 根目錄** — 使用 `git mv` 將每個技能目錄移至 `skills/` 下，保留 git 歷史
  - Verify: `find skills -maxdepth 1 -name "SKILL.md" 2>/dev/null` count 為 0；`find skills -maxdepth 2 -name "SKILL.md" | wc -l` 輸出 42

- T1.3 [ ] **repo 根目錄** — 確認根目錄不再遺留技能目錄
  - Verify: `find . -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print` 輸出為空

## **Task 2: 更新 Shell 安裝腳本**

Purpose: 更新 `scripts/install_skills.sh` 中路徑搜尋邏輯，從 `skills/` 目錄發現技能
Requirements: R2.1, R2.2, R2.3, R2.4
Scope: `scripts/install_skills.sh`
Out of scope: 安裝腳本的安裝/卸載邏輯改動

- T2.1 [ ] **scripts/install_skills.sh `collect_skills()` 函數** — 將 `find "$REPO_ROOT" -mindepth 1 -maxdepth 1 -type d` 改為 `find "$REPO_ROOT/skills" -mindepth 1 -maxdepth 1 -type d`
  - Verify: 執行 `SKILL_DIR=$(bash scripts/install_skills.sh 2>&1 || true); echo "check manually"`

- T2.2 [ ] **scripts/install_skills.sh `bootstrap_repo_if_needed()` / REPO_ROOT 檢測** — 檢查 curl/pipe 模式下 `find "$PWD" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md'` 的 REPO_ROOT 檢測邏輯，更新為正確識別 `skills/` 下的 SKILL.md
  - Verify: 模擬 curl/pipe 場景測試路徑檢測

## **Task 3: 更新 PowerShell 安裝腳本**

Purpose: 同步更新 `scripts/install_skills.ps1` 的技能路徑搜尋邏輯
Requirements: R2.2
Scope: `scripts/install_skills.ps1`
Out of scope: PowerShell 腳本的其他功能

- T3.1 [ ] **scripts/install_skills.ps1** — 尋找 PowerShell 腳本中對應 `collect_skills` 的路徑邏輯，更新為掃描 `skills/` 目錄
  - Verify: 閱讀腳本確認路徑更新正確

## **Task 4: 更新其他代碼路徑引用**

Purpose: 搜尋並更新 repo 中所有引用根目錄技能路徑的代碼
Requirements: R3.1, R3.2, R3.3
Scope: `lib/cli.ts`, `lib/installer.ts`, `.gitignore` 等可能受影響的檔案
Out of scope: 現有測試邏輯的修改（除非因路徑變更導致測試失敗）

- T4.1 [ ] **lib/cli.ts** — 搜尋 `SKILL.md` 或技能目錄相關路徑引用，如需更新則更新
  - Verify: `grep -rn "SKILL.md\|skill.*path\|skillDir\|skillsDir" lib/ bin/ --include="*.ts"` 確認所有引用已正確

- T4.2 [ ] **lib/installer.ts** — 搜尋技能目錄相關路徑引用，如需更新則更新
  - Verify: 同上

- T4.3 [ ] **.gitignore** — 檢查是否需要更新（確保 `skills/` 目錄被正確追蹤）
  - Verify: `git status` 確認 `skills/` 下檔案可被追蹤

- T4.4 [ ] **執行測試** — 執行 `npm test` 確認全部通過；如有失敗，修復路徑相關問題
  - Verify: `npm test` 全部通過
