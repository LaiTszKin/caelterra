---
name: text-to-short-video
description: Generate 30-60 second short videos by directly calling an OpenAI-compatible video generation API from text. Keep role consistency by using roles.json as role prompt source and only updating role descriptions.
---

# Text to Short Video

## Standards

- Evidence: Use `roles.json` as the authoritative role source and collect only the minimal prompt, duration, and sizing inputs.
- Execution: Stay API-only: resolve roles, build one prompt, submit the video job, poll until completion, and download one final MP4.
- Quality: Keep duration in the 30-60 second range, preserve role identity fields, and do not route through storyboard or Remotion skills.
- Output: Save the prompt package, API records, and final short-video artifacts under the project video workspace.

## Required Inputs

Collect only what is required:

- `project_dir` (absolute path)
- `content_name` (output folder/file name)
- source text or user-locked prompt
- target size (`width x height`, default `1080x1920`)
- target duration seconds (default `50`, keep in `30-60` range)

If critical inputs are missing, ask concise follow-up questions.

## Role Definition (Required)

Always use:

- `<project_dir>/pictures/<content_name>/roles.json`

Required JSON format:

```json
{
  "characters": [
    {
      "id": "lin_xia",
      "name": "Lin Xia",
      "appearance": "short black hair, amber eyes, slim build",
      "outfit": "dark trench coat, silver pendant, leather boots",
      "description": "standing calmly, observant expression"
    }
  ]
}
```

Consistency rules:

- Use `roles.json` as the role prompt source.
- Keep `id`, `name`, `appearance`, `outfit` unchanged for existing roles.
- Only modify `description` to reflect this clip's action/emotion.
- If a new role is required, append a new role entry; never rewrite identity fields of existing roles.
- If no recurring roles exist yet, initialize with:

```json
{"characters": []}
```

## Environment Setup

Use this template:

- `~/.codex/skills/text-to-short-video/.env.example`

Copy to:

- `~/.codex/skills/text-to-short-video/.env`

Required keys:

- `OPENAI_API_URL`
- `OPENAI_API_KEY`

Optional keys:

- `OPENAI_VIDEO_MODEL`
- `OPENAI_VIDEO_DURATION_SECONDS`
- `OPENAI_VIDEO_ASPECT_RATIO`
- `OPENAI_VIDEO_SIZE`
- `OPENAI_VIDEO_POLL_SECONDS`
- `TEXT_TO_SHORT_VIDEO_WIDTH`
- `TEXT_TO_SHORT_VIDEO_HEIGHT`

## Workflow

### 1) Resolve `roles.json` before prompt generation

- Target path: `<project_dir>/pictures/<content_name>/roles.json`.
- If file exists, load and reuse role identities.
- If file does not exist, create it with the required schema.
- For existing roles, update only `description` when clip-specific motion/emotion is needed.

### 2) Build one generation prompt from text + roles

- If the user already gives an exact prompt, reuse it directly.
- Otherwise extract one concise visual prompt from source text.
- Keep the prompt focused on one coherent short narrative beat.
- Ensure all role identity details come from `roles.json` and only `description` is clip-specific.
- Save prompt package under:
  - `<project_dir>/video/<content_name>/shorts/api/prompt_input.json`

Suggested local `prompt_input.json` structure:

```json
{
  "roles_file": "<project_dir>/pictures/<content_name>/roles.json",
  "description_overrides": {
    "lin_xia": "running through rain, breathing hard, determined"
  },
  "final_prompt": "..."
}
```

### 3) Submit video generation request

- Endpoint: `${OPENAI_API_URL%/}/videos/generations`
- Send model/prompt/duration/size (or aspect ratio) in JSON payload.
- Save request and response records under:
  - `<project_dir>/video/<content_name>/shorts/api/`

Example request fields (provider-compatible variants are allowed):

```json
{
  "model": "${OPENAI_VIDEO_MODEL}",
  "prompt": "...",
  "duration": 50,
  "size": "1080x1920",
  "aspect_ratio": "9:16"
}
```

### 4) Poll job status until terminal state

- Read job ID from the create response.
- Poll `${OPENAI_API_URL%/}/videos/generations/<job_id>` every `OPENAI_VIDEO_POLL_SECONDS` seconds.
- Stop only on terminal state:
  - success: download output video URL/file
  - failure/cancelled: report provider error and stop

### 5) Download final MP4

Save to:

- `<project_dir>/video/<content_name>/shorts/<content_name>_important.mp4`

If provider returns multiple outputs, keep the best one that matches requested size/duration closest.

### 6) Enforce final aspect ratio and size (optional but recommended)

在操作前先閱讀 `references/enforce-video-aspect-ratio.md` 了解各參數的行為。

When output ratio or resolution differs from target, run:

```bash
apltk enforce-video-aspect-ratio \
  --input-video "<downloaded_video_path>" \
  --output-video "<final_output_video_path>" \
  --env-file ~/.codex/skills/text-to-short-video/.env \
  --force
```

Behavior:

- aspect ratio mismatch: center-crop then scale
- same ratio but different size: scale
- already matching: no-op/copy

## Output Contract

Return absolute paths for:

- `roles.json` used for role consistency
- prompt input JSON (if saved)
- API request payload JSON (if saved)
- API create response JSON (if saved)
- final downloaded `.mp4`
- post-processed `.mp4` (if post-processing executed)

Also report:

- role reuse summary (reused/added roles)
- which role descriptions were modified for this clip
- final prompt text source (user-locked or agent-extracted)
- job ID and final status
- duration check (`30-60` seconds)
- final render size check (`width x height`)
- whether center crop was applied

## Quality Gate Checklist

Before finishing, verify:

- generation path is API-only (no storyboard/remotion orchestration)
- `roles.json` uses required schema and is used as prompt source
- existing role identity fields (`id/name/appearance/outfit`) were not modified
- only role `description` was changed for clip-specific behavior
- job reached a successful terminal state
- output file exists at returned absolute path
- output duration is within `30-60` seconds (or user-approved exception)
- output size matches requested target (after post-processing if needed)

## References

- `references/enforce-video-aspect-ratio.md` — apltk enforce-video-aspect-ratio 工具的完整參數說明。在步驟 6 執行長寬比修正前閱讀。
