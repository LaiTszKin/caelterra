# Caelterra — Hermes 團隊標準化 Plugin

Caelterra 是一個 [Hermes Agent](https://hermes-agent.nousresearch.com) plugin，專為團隊標準化而設。提供多個精良的 skill，讓團隊成員直接載入使用。

## 🚀 快速安裝

一行指令安裝：

```bash
curl -fsSL https://raw.githubusercontent.com/LaiTszKin/caelterra/main/install.sh | bash
```

安裝後：

```bash
# 啟動 caelterra 配置的 session
hermes -p caelterra

# 或者手動執行 setup
hermes caelterra setup

# 檢查更新
hermes caelterra update --check

# 更新 plugin
hermes caelterra update
```

## 📦 Bundled Skills

| Skill | Description |
|-------|-------------|
| `optimise-skill` | 分析並優化 SKILL.md，使其更清晰、更精簡、給 agent 更多發揮空間 |

### 載入 Skill

```bash
# 在 Hermes session 中
skill_view('optimise-skill')
```

或者啟動時載入：

```bash
hermes -s optimise-skill
```

## 📋 CLI Commands

```bash
hermes caelterra setup          # 建立 profile、寫入 SOUL.md、安裝 skills
hermes caelterra update --check # 檢查 GitHub 是否有新版本
hermes caelterra update         # 拉取最新更新
```

## 🔧 開發

```bash
# 安裝開發依賴
uv sync

# 執行測試
uv run pytest -v

# Lint
uv run ruff check .
uv run ruff format --check .
```

## 📄 License

MIT © LaiTszKin
