# update-project-html

Refreshes the project HTML architecture atlas (`resources/project-architecture/`) to reflect the latest code changes.

## When to use

- The existing atlas is out of sync with the current branch or working tree
- Code has changed (new routes, modules, service logic) and the atlas needs updating before a release
- You need to bring `resources/project-architecture/` back in sync after a PR or batch of commits

If no atlas exists yet, use [`init-project-html`](../init-project-html/SKILL.md) to bootstrap one first.

## Core principles

- The CLI owns atlas state and rendered output; never hand-edit `resources/project-architecture/**/*.html`
- Every mutation traces to a specific file + diff hunk; absent code never produces atlas entries
- Measure drift **before and after**: confirm the atlas stays within acceptable thresholds
- Filter diff noise: formatting, config-only, test-only, and comment-only changes never drive atlas mutations

## Workflow

See [`SKILL.md`](./SKILL.md) for the full 6-step workflow.

## References

- [`SKILL.md`](./SKILL.md) — Full workflow and execution rules
- [`../init-project-html/SKILL.md`](../init-project-html/SKILL.md) — C4 semantic rulebook
- [`../init-project-html/references/TEMPLATE_SPEC.md`](../init-project-html/references/TEMPLATE_SPEC.md) — Atlas field reference and schema

## License

MIT
