# Design: 技能目錄重組

- Date: 2026-05-28
- Feature: 技能目錄重組
- Change Name: skill-directory-restructuring

> **Purpose:** **High-level architectural context for `tasks.md`**—structure, coupling, sequencing intent—not a second implementation list. Requirement intent stays in `spec.md`; **documented vendor truth** stays in **`contract.md`**. **`tasks.md` owns** every runnable step (paths, edits, verifies).

## Traceability

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Requirement IDs             | R1.1-R1.4, R2.1-R2.4, R3.1-R3.3                                             |
| In-scope modules (≤3)       | repo 根目錄, `scripts/install_skills.sh`, `scripts/install_skills.ps1`, `lib/cli.ts`, `lib/installer.ts` |
| External systems touched    | None                                                                         |
| Batch coordination          | None（獨立 spec）                                                            |

## Target vs baseline

|                       | Baseline (today) | Target (after this change) |
| --------------------- | ---------------- | --------------------------- |
| Structure / ownership | 42 個技能目錄分散在 repo 根目錄，與 `bin/`, `lib/`, `docs/` 等混雜 | 42 個技能目錄統一在 `skills/` 下，根目錄僅保留非技能目錄 |

## Boundaries

- Entry surface(s): Shell 腳本 (`scripts/install_skills.sh`), PowerShell 腳本 (`scripts/install_skills.ps1`), CLI (`apltk`)
- Trust boundary crossed: `None`
- Outside → inside (one line): `User runs install script` → `collect_skills()` scans `skills/` → `do_replace()` installs each skill

## Modules (nouns only)

| Module key | Responsibility (one sentence) | Owned artifacts (types, tables, queues) |
| ---------- | ---------------------------- | ---------------------------------------- |
| `skills/`    | 存放全部 42 個可安裝的技能目錄 | 每個技能目錄（含 SKILL.md）             |
| `install_skills.sh` | 從 `skills/` 發現技能並安裝至目標平台 | `SHARED_SKILL_PATHS` 陣列 |
| `install_skills.ps1` | PowerShell 版本的安裝腳本 | 同上 |

---

## Interaction anchors (`INT-###`)

**Grain:** **Above `tasks.md`**. One anchor ≈ a **meaningful handshake** between module keys—not one checkbox. Several task lines may realize a single `INT-###`.

| ID        | Intent (when this coupling matters) | Caller → Callee | Coupling kind | Information / state crossing | Failure / propagation expectation |
| --------- | ------------------------------------ | --------------- | ------------- | ---------------------------- | --------------------------------- |
| `INT-001` | 安裝腳本發現技能 | `install_skills.sh` → `skills/` | 檔案系統掃描 (`find`) | 技能目錄路徑列表 | 找不到技能時 exit 1 |
| `INT-002` | curl/pipe 模式檢測 repo root | `bootstrap_repo_if_needed()` → `skills/` | `find` 檢查 SKILL.md 存在性 | repo 識別布林值 | 未找到時走 bootstrap 分支 |

**Ordering / concurrency (design-level):** 遷移操作必須先完成（Task 1），後續 Task 2-4 方可執行

## Requirement linkage (coarse ordering)

### R1 cluster (目錄遷移) → R2 cluster (腳本更新) → R3 cluster (其他引用)

- Anchor order hint: `INT-001` → `INT-002`
- Narrative glue: 先移動目錄，再更新所有引用該目錄的代碼路徑。Task 4 的變更範圍需先透過 grep 搜尋確認

## Data & persistence (design-level)

| Resource                      | Typical readers/writers | Consistency expectation |
| ----------------------------- | ----------------------- | ----------------------- |
| 技能目錄（檔案系統） | `install_skills.sh` (讀), `cp`/`ln` (寫) | 目錄存在性、SKILL.md 存在性 |

## Invariants (system-level)

| Invariant | What breaks it architecturally | Symptoms if violated |
| --------- | ------------------------------ | -------------------- |
| 每個技能目錄必須含 SKILL.md | 目錄被誤移至 `skills/` 但非技能 | `collect_skills()` 收集到非技能目錄，安裝失敗 |
| find path 必須正確指向 skills/ | 安裝腳本路徑未更新 | 安裝時找不到任何技能 |

## Tradeoffs inherited by implementation

| Decision | Rejected alternative | Locks in |
| -------- | -------------------- | -------- |
| `git mv` 保留 git 歷史 | `mv` + `git add`（可能丟失歷史追蹤） | 每個技能目錄的 git history 可追溯 |
| 僅更新 find path，不改動安裝邏輯 | 重構整個 collect_skills 函數 | 最小化變更範圍 |

## Batch-only

None（獨立 spec）
