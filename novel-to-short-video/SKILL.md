---
name: novel-to-short-video
description: Convert novel text into a loopable short-form video by extracting the single most compelling story segment, generating images and voiceover, and assembling a Remotion render. Use when users ask to turn novels or chapters into a 50-60 second narrative short, teaser reel, or looping story clip that feels self-contained yet leaves strong lingering curiosity.
---

# Novel to Short Video

## Dependencies

- Required: `openai-text-to-image-storyboard`, `docs-to-voice`, and `remotion-best-practices` in that order.
- Conditional: none.
- Optional: none.
- Fallback: If any required video-production dependency is unavailable, stop and report the missing dependency instead of substituting another pipeline.

## Standards

- Evidence: Choose exactly one self-contained highlight segment from the novel using explicit tension and standalone-story criteria.
- Execution: Create the plan file, obtain explicit approval, maintain `roles.json`, then generate images, narration, and the final render in sequence.
- Quality: Keep duration at 50-60 seconds, narration pacing at 3-4 CJK chars per second, and preserve loop closure plus role consistency.
- Output: Return the approved plan path, role and prompt files, pacing proof, retained Remotion workspace, and final rendered video path.

## Required Inputs

Collect the minimum required inputs before execution:

- `project_dir` (absolute path)
- `content_name` (output folder/video name)
- novel content (raw text or file path)
- output orientation/resolution (default: vertical 1080x1920)
- narration language/voice preferences when provided

If critical inputs are missing, ask concise follow-up questions.

## Workflow

### 1) Extract one highlight segment

- Parse the novel and list candidate high-tension segments.
- Score each segment by conflict intensity, stakes, emotional swing, turning-point value, visual concreteness, standalone readability, and cliffhanger potential.
- Select exactly **1** segment with the strongest overall dramatic impact.
- Reject segments that cannot be understood without heavy external context from other chapters.
- Prefer segments that can deliver a complete mini-arc while still leaving one meaningful unresolved question.
- Keep a structured segment sheet:
  - `title`
  - `source_excerpt`
  - `core_conflict`
  - `tension_arc` (setup -> escalation -> climax -> aftershock)
  - `standalone_story_basis`
  - `lingering_question`
  - `visual_beats`
  - `narration_key_line`

### 2) Generate a pre-production plan markdown (required)

- Before image/voice/video generation, create:
  - `<project_dir>/docs/plans/`
  - `<project_dir>/docs/plans/<YYYY-MM-DD>-<chapter_slug>.md`
- `chapter_slug` should come from the chapter name/number and be filesystem-safe.
- Build the plan content from template file:
  - `assets/plan-template.md`
- The plan markdown must include:
  - selected highlight segment details,
  - narration script and beat-level timing for the full video,
  - narration pacing target (3-4 chars/second) and expected character count budget,
  - standalone-story check and lingering-question design,
  - image assets that will be generated for the segment,
  - beat-level special-effect cues with intensity guardrails for audience focus.
- All template guidance/placeholders must be wrapped in square brackets (for example `[fill_this]`).
- After filling content, remove every placeholder/guidance marker from the final plan file.
- Enforce 1:1 mapping: one selected highlight segment must map to one full 50-60 second video.

### 3) Request user approval before execution (required)

- Present the generated plan markdown to the user (path + concise summary).
- Ask for explicit approval.
- Do not start image/voice/render execution until user explicitly agrees.
- If user asks for edits, update the plan and request approval again.

### 4) Build a loopable 50-60s script

- Produce one short video with total duration in **50-60 seconds**.
- Keep narration pacing in **3-4 CJK characters per second** (ignore spaces/punctuation in counting).
- For a 50-60 second output, keep narration around **150-240 CJK characters**.
- Build pacing within the same segment using beat progression (hook -> escalation -> climax -> loop closure).
- Make the segment self-contained as a mini-story:
  - viewers can understand setup, conflict, turning point, and immediate outcome without prior chapter context,
  - the narration provides enough context in-line rather than relying on outside exposition.
- Write narration so:
  - first sentence is the hook,
  - final sentence closes the loop by reusing or tightly paraphrasing the first sentence,
  - ending still leaves one unresolved high-stakes question so viewers feel lingering curiosity.
- Ensure the final visual beat can cut/fade back to the opening frame naturally.
- Use the plan markdown as the source of truth and keep beat order aligned with it.

If producing multiple short videos in one request, enforce the same 50-60 second duration for each output.

### 5) Create `roles.json` for recurring character prompts (required)

- Before creating/updating `roles.json`, read:
  - `references/roles-json.md`
- Create directory if missing:
  - `<project_dir>/roles/`
- Create `roles.json` under:
  - `<project_dir>/roles/roles.json`
- If `roles.json` does not exist, create it first before any `prompts.json` planning or generation.
- If `roles.json` already exists, read existing role prompts first and reuse matching roles.
- If a required role is missing, append a new role prompt entry for that role (do not overwrite existing entries).
- Save recurring character prompt skeletons using the schema in `references/roles-json.md`.
- Treat this file as the shared role registry for both short-video and long-video workflows in the same project.
- If the selected segment has no recurring roles, still create `roles.json` with `{"characters": []}`.
- Keep role IDs stable and reuse them in every scene prompt.

### 6) Generate storyboard images (`openai-text-to-image-storyboard`)

- Create `prompts.json` under:
  - `<project_dir>/pictures/<content_name>/prompts.json`
- Use the structured JSON prompt format from `openai-text-to-image-storyboard`.
- Copy top-level `characters` from the final `roles.json` (reused + newly appended roles), then build beat-aligned `scenes` in narrative order.
- Ensure prompts match the image list defined in the plan markdown.
- Generate images with:
  - 在執行前先閱讀 `references/generate-storyboard-images.md` 了解參數。

```bash
apltk generate-storyboard-images \
  --project-dir "<project_dir>" \
  --env-file ~/.codex/skills/openai-text-to-image-storyboard/.env \
  --content-name "<content_name>" \
  --prompts-file "<project_dir>/pictures/<content_name>/prompts.json"
```

### 7) Generate narration and subtitles (`docs-to-voice`)

- Use the loop script text as narration input.
- Generate audio + timeline + SRT:
  - 在執行前先閱讀 `references/docs-to-voice.md` 了解參數。

```bash
apltk docs-to-voice \
  --project-dir "<project_dir>" \
  --project-name "<content_name>" \
  --text "<loop_narration_script>"
```

- Enforce pacing validation after each generation:
  - Read `audio_duration_seconds` from generated `.timeline.json`.
  - Compute `chars_per_second = cjk_char_count(loop_narration_script) / audio_duration_seconds`.
  - Target range is **3.0-4.0 chars/second**.
- If out of range, regenerate with adjustment (max 3 attempts):
  - `say` mode: tune `--rate` (increase when `<3.0`, decrease when `>4.0`).
  - `api` mode: keep voice/model fixed and adjust script length to pull pacing back into range.
- Do not proceed to Remotion render until narration pacing is within target range.

### 8) Compose and render (`remotion-best-practices`)

- Build or reuse Remotion workspace:
  - `<project_dir>/video/<content_name>/remotion/`
- Load Remotion rules as needed (at minimum):
  - `rules/compositions.md`
  - `rules/audio.md`
  - `rules/subtitles.md`
  - `rules/transitions.md`
  - `rules/animations.md`
  - `rules/text-animations.md`
  - `rules/light-leaks.md`
- Implement beat sequencing with subtitle sync from SRT.
- Keep one contiguous narrative segment so the plan's segment-to-video mapping remains valid.
- Apply attention-retention effects according to the approved beat plan:
  - hook beat uses quick visual emphasis (for example punch-in, kinetic subtitle, or parallax),
  - escalation/climax beats use one dominant impact effect each (for example shake, flash, light leak, or speed ramp),
  - loop-closure beat reduces effect intensity and transitions cleanly back to the opening frame.
- Keep effect density controlled:
  - do not stack multiple high-intensity effects at the same time,
  - avoid aggressive flashing that harms subtitle readability.
- Add loop closure in the tail section:
  - final 1-2 seconds visually connect back to opening shot,
  - final spoken line closes back to opening hook.
- Render MP4 output to:
  - `<project_dir>/video/<content_name>/renders/`

### 9) Keep Remotion project and enforce `.gitignore`

Preserve Remotion project sources for user revisions. Do not delete project files after rendering.

Ensure `<project_dir>/video/<content_name>/remotion/.gitignore` includes at least:

```gitignore
node_modules/
out/
dist/
.cache/
*.log
.DS_Store
```

## Output Contract

Return:

- selected highlight-segment summary (with why it was selected)
- proof note that the segment is self-contained and why the ending still leaves viewers wanting more
- plan markdown path (`<project_dir>/docs/plans/<YYYY-MM-DD>-<chapter_slug>.md`)
- explicit user approval confirmation (before asset generation)
- roles prompt file path (`<project_dir>/roles/roles.json`)
- prompts file path (`<project_dir>/pictures/<content_name>/prompts.json`)
- beat-level special-effects summary used in the final render
- generated image directory path
- narration audio path
- subtitle SRT path
- narration pacing proof (`char_count`, `audio_duration_seconds`, `chars_per_second`)
- final rendered video path
- Remotion project path (retained for adjustments)

## Quality Gate Checklist

Before finishing, verify all conditions:

- exactly 1 highest-impact highlight segment selected
- selected segment is understandable as a standalone mini-story
- plan markdown exists in `docs/plans/` with date + chapter naming
- plan content starts from `assets/plan-template.md`
- plan markdown includes the selected segment, beat/script details, standalone-story check, lingering-question design, and segment image generation list
- plan markdown includes a beat-level special-effects map plus intensity guardrails
- all bracketed placeholders/guidance are removed from the final filled plan
- user explicitly approved the plan before image/voice/render steps
- `roles.json` exists and follows `references/roles-json.md`
- existing role prompts are reused when available; new role prompts are added only when missing
- `prompts.json` uses structured mode and reuses role IDs from `roles.json`
- one selected segment maps to one full output video
- duration is within 50-60 seconds per output video
- narration pacing is within 3-4 CJK chars/second
- opening and ending lines form a narrative loop
- special effects strengthen hook/escalation/climax focus without breaking subtitle readability
- ending leaves one unresolved but compelling question
- images and voice assets are generated successfully
- Remotion project is preserved and `.gitignore` is configured

## References

- `references/generate-storyboard-images.md` — apltk generate-storyboard-images 工具的完整參數說明。在步驟 6 生成 storyboard 圖片前閱讀。
- `references/docs-to-voice.md` — apltk docs-to-voice 工具的完整參數說明。在步驟 7 生成旁白前閱讀。
- `references/roles-json.md` — roles.json 的 schema 與角色一致性規則。
