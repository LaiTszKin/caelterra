# Caelterra

Caelterra 是一個 [Hermes Agent](https://hermes-agent.nousresearch.com) plugin，為團隊提供標準化的技能（skills）和版本管理工具。

> **前身：** 這個 repository 原本是 npm 套件 `@laitszkin/apollo-toolkit`。  
> 從 v0.1.0 開始已轉型為 Hermes plugin。詳見 [DEPRECATED.md](./DEPRECATED.md)。

---

## 功能

| 功能 | 說明 |
|------|------|
| **Bundled Skills** | 隨 plugin 附帶的精良 skill，團隊一鍵載入 |
| **Multi-Profile Setup** | `hermes caelterra setup` — 選擇要安裝的 profiles，可選 skills only 或 skills + SOUL.md |
| **狀態查詢** | `hermes caelterra status` — 查看各 profile 的安裝狀態 |
| **更新檢查** | `hermes caelterra update --check` — 比對 GitHub 有無新版本 |
| **自動更新** | `hermes caelterra update` — 拉取最新版，**自動偵測並移除過時 skill**，並依先前設定同步各 profile |

---

## 安裝

```bash
pip install caelterra && hermes plugins enable caelterra
```

> `fabricium` 會作為依賴自動安裝。

安裝後執行：

```bash
hermes caelterra setup
```

互動式選擇目標 profiles 和安裝模式即可。

---

## 使用方式

### CLI 命令

```bash
hermes caelterra setup              # 互動式：選 profiles、選模式、安裝
hermes caelterra status             # 查看各 profile 安裝狀態
hermes caelterra update --check     # 檢查 GitHub 是否有新版本
hermes caelterra update             # 拉取最新版 + 清理過時 skill + 同步 profiles
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
| `optimise-skill` | 五階段優化 SKILL.md：審查 → 解耦 → 重寫 → 驗證（含觸發測試、模擬執行、邊界攻擊）→ 交付。核心方法：三層分離 + Delta from Baseline + Gotchas 提取 |

---

## 架構概覽

```
caelterra/
├── __init__.py              # Plugin 入口：register() + CLI handlers
│   ├── _load_state()        #   讀取安裝狀態 (JSON)
│   ├── _set_profile_state() #   寫入 profile 安裝狀態
│   ├── _list_profiles()     #   掃描 ~/.hermes/profiles/
│   ├── _prompt_yes_no()     #   互動式 yes/no，非 TTY 時自動默認
│   ├── _prompt_select_profiles()  # 多選 profiles
│   ├── _ensure_profile()    #   建立 Hermes profile
│   ├── _apply_soul_md()     #   寫入 SOUL.md
│   ├── _is_skill_dir()      #   判斷目錄是否為有效 skill
│   ├── _get_bundled_skill_names()  # 掃描 bundled skills
│   ├── _remove_installed_skill()   # 刪除已安裝的 skill
│   ├── _remove_stale_skills()      # 偵測過時 skill
│   ├── _install_bundled_skills()   # 安裝所有 bundled skills
│   ├── _setup_command()     #   setup CLI handler（multi-profile）
│   ├── _status_command()    #   status CLI handler
│   ├── _update_check()      #   update --check CLI handler
│   ├── _sync_installed_profiles()  # 更新後同步 profiles
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
3. 檢查 ahead/behind → 如已最新則仍重新整理 skills + SOUL 後退出
4. Pull --ff-only
5. 掃描 ~/.hermes/skills/ 比對 bundled skills
   → 找出 installed 但 no longer bundled 的過時 skill
   → 互動式詢問是否刪除（默認是）
6. 更新其餘 skills
7. 讀取 ~/.hermes/caelterra_state.json
8. 對每個已安裝的 profile：
   → 更新 SOUL.md（如先前設定有包含）
   → 刷新 timestamp
```

### 安裝狀態

Caelterra 使用 `~/.hermes/caelterra_state.json` 追蹤各 profile 的安裝狀態：

```json
{
  "profiles": {
    "caelterra": {
      "soul_md": true,
      "updated_at": "2026-07-11T12:00:00"
    }
  }
}
```

- Profile 出現在 state → skills 已安裝
- `soul_md: true` → 該 profile 也安裝了 SOUL.md

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

### 安裝狀態存在哪裡？

存在 `~/.hermes/caelterra_state.json`，追蹤每個 profile 的安裝模式和時間。

### 更新時如果有未提交變更？

更新會被阻止，系統會列出 dirty files，告訴你先 stash 或 commit。

### 支援同時安裝到多個 profile 嗎？

支援。`setup` 時可選擇多個 profiles，`update` 時會自動同步所有已安裝的 profiles。

---

## 版本記錄

| 版本 | 日期 | 說明 |
|------|------|------|
| v0.1.1 | 2026-07-11 | Multi-profile setup/status/update、狀態管理 JSON、移除 install.sh |
| v0.1.0 | 2026-07-11 | 初始版本。Plugin 結構、setup/update CLI、optimise-skill 捆綁、互動式 prompt、stale skill 偵測移除、ruff + mypy + black pre-commit |

## License

MIT © LaiTszKin
