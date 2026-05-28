# apltk architecture — 宣告式架構圖 CLI

## 用途
透過 YAML 狀態檔案管理 `resources/project-architecture/` 下的架構圖，支援基礎架構圖與 spec 覆蓋層的差異比對與合併。

## 用法
```
apltk architecture [verb] [options]
```

## 全局旗標
| 旗標 | 效果 |
|------|------|
| `--project <root>` | 指定專案根目錄（預設從 cwd 向上搜尋） |
| `--spec <spec_dir>` | 寫入 spec overlay 而非基礎架構圖 |
| `--no-render` | 變更後略過自動重新渲染，可批次多條指令 |
| `--no-open` | `open` 和 `diff` 時不開啟瀏覽器 |
| `--dry-run` | 預覽變更為 JSON diff，不實際寫入 |
| `--out <dir>` | `diff` 的輸出目錄 |
| `--clean` | `merge` 成功後移除 spec overlay 目錄 |
| `--all` | `merge` 時選取所有 pending spec overlay |
| `--json` | `status` 時輸出 JSON |
| `--evidence <level[:source]>` | 為組件標記 observed/inferred/assumed 品質等級 |

## 頂層動詞
- **`open`** — 開啟基礎架構圖 HTML，若未渲染則先 bootstrap
- **`diff`** — 收集 `docs/plans/` 下所有 overlay，產生 before/after 檢視器
- **`render`** — 從當前 YAML 狀態重新產生 HTML
- **`validate`** — 驗證架構圖結構完整性（schema + referential integrity）
- **`status`** — 顯示摘要（feature/submodule/edge/actor 數量、時間戳、驗證狀態）
- **`scan --src <dir>`** — 掃描目錄結構，輸出 JSON 候選 feature 列表
- **`undo [--steps <n>]`** — 還原最近一次 mutation
- **`merge --spec <dir> | --all`** — 將 spec overlay 合併回基礎架構圖

## Mutation 系列

所有 mutation 共用 `--project`、`--spec`、`--no-render`、`--dry-run`、`--evidence` 旗標。

### feature
```
apltk architecture feature add --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]
apltk architecture feature set --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]
apltk architecture feature remove --slug <feature>
```

### submodule
```
apltk architecture submodule add --feature <feature> --slug <submodule> [--kind service|api|ui|worker|external] [--role "..."]
apltk architecture submodule set --feature <feature> --slug <submodule> [--kind ...] [--role "..."]
apltk architecture submodule remove --feature <feature> --slug <submodule>
```

### function
```
apltk architecture function add --feature <feature> --submodule <submodule> --name <fn> [--in "..."] [--out "..."] [--side "..."] [--purpose "..."]
apltk architecture function remove --feature <feature> --submodule <submodule> --name <fn>
```

### variable
```
apltk architecture variable add --feature <feature> --submodule <submodule> --name <var> [--type "..."] [--scope "..."] [--purpose "..."]
apltk architecture variable remove --feature <feature> --submodule <submodule> --name <var>
```

### dataflow
```
apltk architecture dataflow add --feature <feature> --submodule <submodule> --step "..." [--at <index>] [--fn <name>] [--reads a,b] [--writes x,y]
apltk architecture dataflow remove --feature <feature> --submodule <submodule> (--step "..." | --at <index>)
apltk architecture dataflow reorder --feature <feature> --submodule <submodule> --from <index> --to <index>
```

### error
```
apltk architecture error add --feature <feature> --submodule <submodule> --name <error> [--when "..."] [--means "..."]
apltk architecture error remove --feature <feature> --submodule <submodule> --name <error>
```

### edge
```
apltk architecture edge add --from <feature[/submodule]> --to <feature[/submodule]> [--kind call|return|data-row|failure] [--label "..."] [--id <edge-id>]
apltk architecture edge remove --from <feature[/submodule]> --to <feature[/submodule]> [--id <edge-id>]
```

### meta
```
apltk architecture meta set [--title "..."] [--summary "..."]
```

### actor
```
apltk architecture actor add --id <actor-id> [--label "..."]
apltk architecture actor remove --id <actor-id>
```

## 注意事項
- 執行 mutation 後自動重新渲染（除非 `--no-render`）
- 每個 mutation 建立 undo snapshot，可行 `undo` 還原
- 驗證通過後才算架構圖工作完成
