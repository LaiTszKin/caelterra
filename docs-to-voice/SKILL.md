---
name: docs-to-voice
description: Convert text and document content into audio files and sentence-level subtitle timelines under project_dir/audio/{project_name}/. Supports both macOS say and Alibaba Cloud Model Studio API modes.
---

# Docs to Voice

## Standards

- Evidence: Confirm `project_dir`, input source, mode, and environment-backed settings before generation.
- Execution: Use `apltk docs-to-voice` to write audio plus matching timeline and subtitle files under `project_dir/audio/{project_name}/`.
- Quality: Respect mode-specific options, sentence splitting rules, and post-process requirements such as `ffmpeg` for speed changes.
- Output: Return the absolute output audio path together with the generated `.timeline.json` and `.srt` companions.

## Workflow

1. Collect inputs.
   - Require `project_dir`.
   - Accept either raw text or one input text file.
   - Set `project_name`; default to basename of `project_dir`.

2. Select mode.
   - `--mode say` for local generation.
   - `--mode api` for Model Studio API generation.
   - If omitted, load `DOCS_TO_VOICE_MODE` from `.env`, then shell environment variables; fallback `say`.

3. Prepare output path.
   - Build `project_dir/audio/{project_name}/`.
   - Create directory if it does not exist.

4. Generate audio.
   - `say` mode supports `--voice`, `--rate`, and punctuation-pause enhancement.
   - `api` mode supports `--api-endpoint`, `--api-model`, `--api-voice`, and reads `DASHSCOPE_API_KEY`.
   - `api` mode sends one request per sentence and concatenates all sentence audio into one final file.
   - `api` mode auto discovers model max input length; only oversized sentences are split by that limit.
   - `--max-chars` (or `DOCS_TO_VOICE_MAX_CHARS`) can override the sentence split limit; `0` disables chunking.
   - `--speech-rate` (or `DOCS_TO_VOICE_SPEECH_RATE`) applies optional post-process speed adjustment and requires `ffmpeg` when value is not `1`.
   - API splitting uses model counting rules (for `qwen3-tts`, CJK chars count as 2 units).

5. Generate sentence-level timeline files.
   - Write JSON timeline and SRT subtitle files next to audio output.
   - In `api` mode, timeline start/end uses per-sentence audio durations whenever available.

6. Return completion details.
   - Report absolute output audio path.

## CLI reference

- `references/docs-to-voice.md` — apltk docs-to-voice 工具的完整參數說明。在步驟 2 選擇 mode 前閱讀。

在執行產出前先閱讀 `references/docs-to-voice.md` 了解各 mode 的參數與環境變數設定方式。

## Troubleshooting

- `say` mode: confirm `command -v say` and `command -v python3`.
- `api` mode: confirm `command -v python3` and valid `DASHSCOPE_API_KEY`.
- Long-text chunk merge (especially AIFF output): recommend `command -v ffmpeg`.
- If output exists, use the overwrite or rename options shown in `apltk docs-to-voice --help`.
