# Caelterra

Caelterra 是一個 [Hermes Agent](https://hermes-agent.nousresearch.com) plugin，為團隊提供標準化的技能（skills）和版本管理工具。

> **前身：** 這個 repository 原本是 npm 套件 `@laitszkin/apollo-toolkit`。  
> 從 v0.1.0 開始已轉型為 Hermes plugin。詳見 [DEPRECATED.md](./DEPRECATED.md)。

---

## 功能

| 功能 | 說明 |
|------|------|
| **Bundled Skills** | 隨 plugin 附帶的精良 skill，團隊一鍵載入 |
| **互動式 Setup** | `hermes caelterra setup` — 建立 profile、寫入 SOUL.md、安裝 skills，可選是否覆蓋 |
| **更新檢查** | `hermes caelterra update --check` — 比對 GitHub 有無新版本 |
| **自動更新** | `hermes caelterra update` — 拉取最新版，**自動偵測並移除過時 skill**，互動式詢問 SOUL.md 是否覆蓋 |
| **一鍵安裝** | `curl ... \| bash` — 團隊成員無需手動操作 |

---

## 安裝

```bash
curl -fsSL https://raw.githubusercontent.com/LaiTszKin/caelterra/main/install.sh | bash
```

安裝腳本會自動：
1. 檢查 `hermes` 和 `git` 是否可用
2. 透過 `hermes plugins install LaiTszKin/caelterra` 從 GitHub 安裝 plugin
3. 執行 `hermes caelterra setup` 建立 profile、寫入 SOUL.md、安裝 skills

> 若 plugin 已安裝過，`hermes plugins install` 會自動拉取最新版本。

---

## 使用方式

### CLI 命令

```bash
hermes caelterra setup              # 建立 profile + 安裝 SOUL.md + 安裝 skills
hermes caelterra update --check     # 檢查 GitHub 是否有新版本
hermes caelterra update             # 拉取最新版 + 清理過時 skill + 更新 skills
```

### 啟動 session

```bash
hermes -p caelterra
```

### 載入 skill

```bash
# 在 Hermes session 中
skill_view('optimise-skill')

# 或啟動時載入
hermes -s optimise-skill
```

---

## Bundled Skills

| Skill | 用途 |
|-------|------|
| `optimise-skill` | 分析並優化 SKILL.md，使其更清晰、更精簡。核心方法：三層分離（Behavioral / Format / Tool） |

---

## 架構概覽

```
caelterra/
├── __init__.py              # Plugin 入口：register() + CLI handlers
│   ├── _prompt_yes_no()     #   互動式 yes/no，非 TTY 時自動默認
│   ├── _ensure_profile()    #   建立 Hermes profile
│   ├── _apply_soul_md()     #   寫入 SOUL.md
│   ├── _is_skill_dir()      #   判斷目錄是否為有效 skill
│   ├── _get_bundled_skill_names()  # 掃描 bundled skills
│   ├── _remove_installed_skill()   # 刪除已安裝的 skill
│   ├── _remove_stale_skills()      # 偵測過時 skill
│   ├── _install_bundled_skills()   # 安裝所有 bundled skills
│   ├── _setup_command()     #   setup CLI handler
│   ├── _update_check()      #   update --check CLI handler
│   └── _update_pull()       #   update CLI handler（含 stale skill 檢測）
├── git_utils.py              # Git 操作封裝（TypedDict）
│   ├── is_git_repo()
│   ├── get_local_head()
│   ├── get_remote_url()
│   ├── get_default_branch()
│   ├── fetch_remote()
│   ├── get_remote_head()
│   ├── get_ahead_behind()
│   └── pull_branch()
├── plugin.yaml               # Hermes plugin manifest
├── pyproject.toml            # Python 專案設定
├── .pre-commit-config.yaml   # Pre-commit hooks（ruff → mypy → black）
├── SOUL.md                   # Agent identity（setup 時寫入 profile）
├── install.sh                # curl 一鍵安裝腳本
├── skills/
│   └── optimise-skill/       # Bundled skill
│       ├── SKILL.md
│       ├── agents/openai.yaml
│       └── references/
└── tests/
    ├── test_git_utils.py     # 10 個 git_utils 單元測試
    └── conftest.py           # git repo fixture
```

### 更新流程

```
update 指令執行時：

1. 檢查有無未提交變更 → 有則阻止
2. Fetch remote refs
3. 檢查 ahead/behind → 如已最新則退出
4. Pull --ff-only
5. 掃描 ~/.hermes/skills/ 比對 bundled skills
   → 找出 installed 但 no longer bundled 的過時 skill
   → 互動式詢問是否刪除（默認是）
6. 更新其餘 skills
7. 互動式詢問是否覆蓋 SOUL.md（默認是）
```

---

## 開發

### 環境設定

```bash
# 安裝依賴（含 dev）
uv sync --group dev

# 安裝 pre-commit hooks（提交前自動檢查）
uv run pre-commit install
```

### 品質關卡

提交前會自動執行（`pre-commit`）：

```bash
# 手動執行也一樣
uv run pre-commit run --all-files
```

執行順序：

| 關卡 | 失敗時 |
|------|--------|
| `ruff check .` | 禁止提交 |
| `mypy --strict .` | 禁止提交 |
| `black` | 自動 reformat |

### 執行測試

```bash
uv run pytest tests/ -v
```

### 型別檢查

```bash
uv run mypy --strict .
```

### Lint

```bash
uv run ruff check .
```

---

## FAQ

### Caelterra 和 Jovaltus 有什麼關係？

沒有關係。Caelterra 是一個全新的 plugin，專注於團隊標準化的 skills 管理，不包含 Jovaltus 的開發 pipeline 功能。

### 如何新增一個 bundled skill？

在 `skills/` 下建立目錄，裡面放 `SKILL.md` 即可。Plugin 啟動時會自動註冊。

### install.sh 是非互動的，SOUL.md 會怎樣？

非 TTY 環境下 `_prompt_yes_no()` 自動返回默認值（覆蓋）。所以 curl pipe 安裝時會直接覆蓋 SOUL.md。

### 更新時如果有未提交變更？

更新會被阻止，系統會列出 dirty files，告訴你先 stash 或 commit。

---

## 版本記錄

| 版本 | 日期 | 說明 |
|------|------|------|
| v0.1.0 | 2026-07-11 | 初始版本。Plugin 結構、setup/update CLI、optimise-skill 捆綁、互動式 prompt、stale skill 偵測移除、ruff + mypy + black pre-commit |

## License

MIT © LaiTszKin
