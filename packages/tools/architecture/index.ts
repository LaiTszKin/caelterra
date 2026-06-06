import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import yaml from 'js-yaml';
import { UserInputError, SystemError, createPlatformAdapter } from '@laitszkin/tool-utils';

// ── Apply & Template helpers (mirrors cli.js internals for the new verbs) ─────

function findFeature(state: any, slug: string): any {
  return (state.features || []).find((f: any) => f.slug === slug);
}

function findSubmodule(feature: any, slug: string): any {
  return ((feature && feature.submodules) || []).find((s: any) => s.slug === slug);
}

function ensureFeature(state: any, slug: string, init?: Record<string, unknown>): any {
  let feature = findFeature(state, slug);
  if (!feature) {
    feature = { slug, title: slug, story: '', dependsOn: [], submodules: [], edges: [], ...init };
    state.features = state.features || [];
    state.features.push(feature);
  } else if (init) {
    Object.assign(feature, init);
  }
  return feature;
}

function removeFeature(state: any, slug: string): boolean {
  if (!state.features) return false;
  const before = state.features.length;
  state.features = state.features.filter((f: any) => f.slug !== slug);
  state.edges = (state.edges || []).filter(
    (e: any) => !endpointReferences(e.from, slug) && !endpointReferences(e.to, slug),
  );
  return state.features.length < before;
}

function endpointReferences(endpoint: any, slug: string): boolean {
  if (!endpoint || typeof endpoint === 'string') return false;
  return endpoint.feature === slug;
}

function ensureSubmodule(feature: any, slug: string, init?: Record<string, unknown>): any {
  let sub = findSubmodule(feature, slug);
  if (!sub) {
    sub = { slug, kind: 'service', role: '', functions: [], variables: [], dataflow: [], errors: [], ...init };
    feature.submodules = feature.submodules || [];
    feature.submodules.push(sub);
  } else if (init) {
    Object.assign(sub, init);
  }
  return sub;
}

function removeSubmodule(feature: any, slug: string, merged?: any): boolean {
  if (!feature.submodules) return false;
  const before = feature.submodules.length;
  feature.submodules = feature.submodules.filter((s: any) => s.slug !== slug);
  feature.edges = (feature.edges || []).filter((e: any) => {
    const f = typeof e.from === 'string' ? e.from : e.from?.submodule;
    const t = typeof e.to === 'string' ? e.to : e.to?.submodule;
    return f !== slug && t !== slug;
  });
  if (merged) {
    merged.edges = (merged.edges || []).filter((e: any) => {
      const fromEp = typeof e.from === 'object' && e.from;
      const toEp = typeof e.to === 'object' && e.to;
      const fromMatch = fromEp && fromEp.feature === feature.slug && fromEp.submodule === slug;
      const toMatch = toEp && toEp.feature === feature.slug && toEp.submodule === slug;
      return !fromMatch && !toMatch;
    });
  }
  return feature.submodules.length < before;
}

function parseEndpoint(value: string): { feature: string; submodule?: string } {
  const parts = value.split('/').filter(Boolean);
  if (parts.length === 0) throw new UserInputError(`Invalid endpoint: "${value}"`);
  return parts.length > 1
    ? { feature: parts[0], submodule: parts[1] }
    : { feature: parts[0] };
}

function isIntraFeatureEdge(from: any, to: any): boolean {
  return from?.feature && to?.feature && from.feature === to.feature && from.submodule && to.submodule;
}

function endpointEquals(a: any, b: any): boolean {
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (!a || !b) return false;
  return a.feature === b.feature && (a.submodule ?? null) === (b.submodule ?? null);
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ一-鿿]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 64) || 'feature';
}

function parseSpecMetadata(filePath: string): { title: string; goal: string } {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let title = '';
  let inGoal = false;
  const goalLines: string[] = [];

  for (const line of lines) {
    if (!title && line.startsWith('# ') && !line.startsWith('## ')) {
      title = line.replace(/^#\s+/, '').replace(/^Spec:\s*/i, '').trim();
    }
    if (line.startsWith('## Goal')) {
      inGoal = true;
      continue;
    }
    if (inGoal) {
      if (line.startsWith('## ')) break;
      goalLines.push(line);
    }
  }

  const goal = goalLines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, goal };
}

function yamlStr(value: string): string {
  if (/["\n]/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return `"${value}"`;
}

// ── apply ────────────────────────────────────────────────────────────────────

async function handleApply(applyArgs: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const sourceRoot =
    context.sourceRoot ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  const yamlArg = applyArgs[0];
  if (!yamlArg || yamlArg.startsWith('--')) {
    throw new UserInputError('Missing architecture specification YAML file path. Usage: apltk architecture apply <yaml-file>');
  }

  // Simple flag parser for trailing flags (--spec, --project, --no-render)
  const rest = applyArgs.slice(1);
  const flags: Record<string, any> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--no-render') flags['no-render'] = true;
    else if (a === '--spec' && i + 1 < rest.length) flags.spec = rest[++i];
    else if (a === '--project' && i + 1 < rest.length) flags.project = rest[++i];
  }

  // Parse YAML
  let batch: any;
  try {
    const yamlPath = path.resolve(yamlArg);
    const raw = fs.readFileSync(yamlPath, 'utf8');
    batch = yaml.load(raw);
  } catch (e: any) {
    const location = e.mark ? ` at line ${e.mark.line + 1}` : '';
    throw new UserInputError(`Error parsing apply YAML (${yamlArg})${location}: ${e.message}`);
  }

  if (!batch || typeof batch !== 'object') {
    throw new UserInputError('Invalid apply YAML: expected an object with "features" / "edges" keys.');
  }

  // Import atlas modules (shared with the existing JS CLI)
  const cliPath = path.join(
    sourceRoot,
    'skills',
    'init-project-html',
    'lib',
    'atlas',
    'cli.js',
  );
  const statePath = path.join(
    sourceRoot,
    'skills',
    'init-project-html',
    'lib',
    'atlas',
    'state.js',
  );

  const [cliMod, stateMod] = await Promise.all([
    import(pathToFileURL(cliPath).href),
    import(pathToFileURL(statePath).href),
  ]);
  const cli: any = cliMod.default;
  const stateLib: any = stateMod.default;

  // Resolve project root
  let projectRoot: string;
  try {
    projectRoot = cli.resolveProjectRoot(flags);
  } catch (e: any) {
    throw new UserInputError(e.message);
  }

  const isSpec = Boolean(flags.spec);
  const atlasDir = cli.baseAtlasDir(projectRoot);
  let merged: any;
  let overlayDir: string | null = null;
  let preOverlayBase: any;

  if (isSpec) {
    const sov = cli.specOverlayDir(projectRoot, flags.spec);
    overlayDir = sov.overlayDir;
    preOverlayBase = stateLib.load(atlasDir); // snapshot before overlay merge
    const overlay = stateLib.loadOverlay(overlayDir);
    merged = stateLib.mergeOverlay(preOverlayBase, overlay);
  } else {
    merged = JSON.parse(JSON.stringify(stateLib.load(atlasDir)));
  }

  // ── Process mutations on the in-memory merged state ──
  // All processing happens on the deep-clone; disk is not touched until
  // every step succeeds.  If anything throws, the batch is aborted and
  // nothing is persisted.

  try {
    // 1) Features (add / modify / remove)
    for (const feat of batch.features || []) {
      const slug: string = feat.slug;
      if (!slug) throw new UserInputError('"features" entry missing required "slug" field');

      switch (feat.action) {
        case 'add': {
          const init: Record<string, unknown> = {};
          if (feat.title !== undefined) init.title = String(feat.title);
          if (feat.story !== undefined) init.story = String(feat.story);
          if (feat.dependsOn !== undefined)
            init.dependsOn = Array.isArray(feat.dependsOn) ? feat.dependsOn : [feat.dependsOn];
          if (feat.evidence !== undefined) init.evidence = feat.evidence;
          ensureFeature(merged, slug, init);
          break;
        }
        case 'modify': {
          const existing = findFeature(merged, slug);
          if (!existing) throw new UserInputError(`feature "${slug}" not found for action "modify"`);
          if (feat.title !== undefined) existing.title = String(feat.title);
          if (feat.story !== undefined) existing.story = String(feat.story);
          if (feat.dependsOn !== undefined)
            existing.dependsOn = Array.isArray(feat.dependsOn) ? feat.dependsOn : [feat.dependsOn];
          if (feat.evidence !== undefined) existing.evidence = feat.evidence;
          break;
        }
        case 'remove':
          removeFeature(merged, slug);
          break;
        default:
          throw new UserInputError(`feature "${slug}": unknown action "${feat.action}"`);
      }
    }

    // 2) Submodules (add / remove) — skip features that were removed
    for (const feat of batch.features || []) {
      if (feat.action === 'remove') continue;
      const parent = findFeature(merged, feat.slug);
      if (!parent) throw new UserInputError(`feature "${feat.slug}" not found for submodule operations`);
      for (const sub of feat.submodules || []) {
        switch (sub.action) {
          case 'add': {
            const init: Record<string, unknown> = {};
            if (sub.kind !== undefined) init.kind = String(sub.kind);
            if (sub.role !== undefined) init.role = String(sub.role);
            if (sub.evidence !== undefined) init.evidence = sub.evidence;
            ensureSubmodule(parent, sub.slug, init);
            break;
          }
          case 'remove':
            removeSubmodule(parent, sub.slug, merged);
            break;
          default:
            throw new UserInputError(
              `submodule "${feat.slug}/${sub.slug}": unknown action "${sub.action}"`,
            );
        }
      }
    }

    // 3) Functions (add / remove) — skip removed features & submodules
    for (const feat of batch.features || []) {
      if (feat.action === 'remove') continue;
      const parent = findFeature(merged, feat.slug);
      if (!parent) continue;
      for (const sub of feat.submodules || []) {
        if (sub.action === 'remove') continue;
        const subMod = findSubmodule(parent, sub.slug);
        if (!subMod)
          throw new UserInputError(`submodule "${feat.slug}/${sub.slug}" not found for function operations`);
        for (const fn of sub.functions || []) {
          switch (fn.action) {
            case 'add': {
              subMod.functions = (subMod.functions || []).filter(
                (f: any) => f.name !== fn.name,
              );
              const newFn: Record<string, unknown> = { name: fn.name };
              if (fn.in !== undefined) newFn.in = String(fn.in);
              if (fn.out !== undefined) newFn.out = String(fn.out);
              if (fn.side !== undefined) newFn.side = String(fn.side);
              if (fn.purpose !== undefined) newFn.purpose = String(fn.purpose);
              if (fn.evidence !== undefined) newFn.evidence = fn.evidence;
              subMod.functions.push(newFn);
              break;
            }
            case 'remove':
              subMod.functions = (subMod.functions || []).filter(
                (f: any) => f.name !== fn.name,
              );
              break;
            default:
              throw new UserInputError(
                `function "${feat.slug}/${sub.slug}/${fn.name}": unknown action "${fn.action}"`,
              );
          }
        }
      }
    }

    // 4) Edges (add / remove)
    for (const edge of batch.edges || []) {
      let from: { feature: string; submodule?: string };
      let to: { feature: string; submodule?: string };
      try {
        from = parseEndpoint(edge.from);
        to = parseEndpoint(edge.to);
      } catch (er: any) {
        throw new UserInputError(`edge: ${er.message}`);
      }

      switch (edge.action) {
        case 'add': {
          // Referential integrity validation
          const fromFeature = findFeature(merged, from.feature);
          if (!fromFeature) {
            throw new UserInputError(
              `edge "${edge.from} → ${edge.to}": source feature "${from.feature}" not found`,
            );
          }
          if (from.submodule) {
            const fromSub = findSubmodule(fromFeature, from.submodule);
            if (!fromSub) {
              throw new UserInputError(
                `edge "${edge.from} → ${edge.to}": source submodule "${from.submodule}" not found in feature "${from.feature}"`,
              );
            }
          }
          const toFeature = findFeature(merged, to.feature);
          if (!toFeature) {
            throw new UserInputError(
              `edge "${edge.from} → ${edge.to}": target feature "${to.feature}" not found`,
            );
          }
          if (to.submodule) {
            const toSub = findSubmodule(toFeature, to.submodule);
            if (!toSub) {
              throw new UserInputError(
                `edge "${edge.from} → ${edge.to}": target submodule "${to.submodule}" not found in feature "${to.feature}"`,
              );
            }
          }

          const eid = edge.id || `e-${Math.random().toString(36).slice(2, 8)}`;
          const kind = edge.kind || 'call';
          const label = edge.label !== undefined ? String(edge.label) : '';
          const edgeEvidence = edge.evidence !== undefined ? { evidence: edge.evidence } : {};

          if (isIntraFeatureEdge(from, to)) {
            const feature = findFeature(merged, from.feature);
            feature.edges = (feature.edges || []).filter((ex: any) => ex.id !== eid);
            feature.edges.push({
              id: eid,
              from: from.submodule,
              to: to.submodule,
              kind,
              label,
              ...edgeEvidence,
            });
          } else {
            merged.edges = (merged.edges || []).filter((ex: any) => ex.id !== eid);
            merged.edges.push({ id: eid, from, to, kind, label, ...edgeEvidence });
          }
          break;
        }
        case 'remove': {
          const byId = edge.id ? (ex: any) => ex.id === edge.id : null;
          if (isIntraFeatureEdge(from, to)) {
            const feature = findFeature(merged, from.feature);
            if (feature) {
              feature.edges = (feature.edges || []).filter((ex: any) => {
                if (byId && ex.id === edge.id) return false;
                const ef = typeof ex.from === 'string' ? ex.from : ex.from?.submodule;
                const et = typeof ex.to === 'string' ? ex.to : ex.to?.submodule;
                return !(ef === from.submodule && et === to.submodule);
              });
            }
          } else {
            merged.edges = (merged.edges || []).filter((ex: any) => {
              if (byId && ex.id === edge.id) return false;
              return !(endpointEquals(ex.from, from) && endpointEquals(ex.to, to));
            });
          }
          break;
        }
        default:
          throw new UserInputError(`edge "${edge.from} → ${edge.to}": unknown action "${edge.action}"`);
      }
    }
  } catch (e: any) {
    if (e instanceof UserInputError || e instanceof SystemError) {
      throw e;
    }
    throw new UserInputError(e.message);
  }

  // ── All mutations succeeded — persist ──
  const saveDir = isSpec ? overlayDir! : atlasDir;

  // Write undo snapshot **before** committing, so undo goes back to the pre-apply state.
  if (isSpec) {
    const freshBase = stateLib.load(atlasDir);
    stateLib.writeUndoSnapshot(saveDir, {
      base: freshBase,
      overlay: stateLib.loadOverlay(overlayDir!),
    });
    stateLib.saveOverlay(saveDir, stateLib.deriveOverlay(freshBase, merged));
    stateLib.appendHistory(saveDir, {
      action: 'apply',
      args: { yaml: yamlArg },
      mode: 'spec',
    });
  } else {
    stateLib.writeUndoSnapshot(saveDir, { base: stateLib.load(atlasDir) });
    stateLib.save(saveDir, merged);
    stateLib.appendHistory(saveDir, {
      action: 'apply',
      args: { yaml: yamlArg },
      mode: 'base',
    });
  }

  stdout.write(
    `atlas: apply applied — ${(batch.features || []).length} feature(s), ${(batch.edges || []).length} edge(s)\n`,
  );

  // Auto-render
  if (!flags['no-render']) {
    const renderFlags = isSpec ? { spec: flags.spec } : {};
    await cli.runRender({
      projectRoot,
      flags: renderFlags,
      preloadedMerged: merged,
      preloadedBase: isSpec ? preOverlayBase : undefined,
    });
  }

  return 0;
}

// ── template ─────────────────────────────────────────────────────────────────

async function handleTemplate(templateArgs: string[], context: ToolContext): Promise<number> {
    const stdout = context.stdout || process.stdout;
    const stderr = context.stderr || process.stderr;
    const adapter = createPlatformAdapter();

    // Parse --spec <dir> --output <dir>
    let specDir: string | undefined;
    let outputDir: string | undefined;
    for (let i = 0; i < templateArgs.length; i++) {
      const a = templateArgs[i];
      if (a === '--spec' && i + 1 < templateArgs.length) specDir = templateArgs[++i];
      else if (a === '--output' && i + 1 < templateArgs.length) outputDir = templateArgs[++i];
    }

    if (!specDir || !outputDir) {
      throw new UserInputError('Missing --spec and/or --output arguments. Usage: apltk architecture template --spec <spec-dir> --output <output-dir>');
    }

    const specPath = path.resolve(specDir, 'SPEC.md');
    const outputDirPath = path.resolve(outputDir);
    const outputPath = path.join(outputDirPath, 'proposal.yaml');

    // Extract spec metadata (title, goal) from SPEC.md
    let featureSlug = 'feature';
    let featureTitle = 'Feature';
    let goal = '';

    if (fs.existsSync(specPath)) {
      const meta = parseSpecMetadata(specPath);
      if (meta.title) {
        featureTitle = meta.title;
        featureSlug = toSlug(featureTitle);
      }
      if (meta.goal) {
        goal = meta.goal;
      }
    } else {
    const resolvedSpecDir = path.resolve(specDir);
    if (!fs.existsSync(resolvedSpecDir)) {
      throw new UserInputError(`Spec directory not found: ${resolvedSpecDir}`);
    }
    const mdFiles = fs.readdirSync(resolvedSpecDir).filter((f: string) => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      throw new UserInputError(`Spec directory found but no SPEC.md. Found: ${mdFiles.join(', ')}`);
    }
    throw new UserInputError('Spec directory found but no SPEC.md. No .md files found.');
  }

  // Build proposal.yaml content
  const lines: string[] = [
    '# proposal.yaml — generated by `apltk architecture template`',
    '# Fill in the sections below to describe the architecture proposal.',
    '',
    'features:',
    `  - slug: ${featureSlug}`,
    `    title: ${yamlStr(featureTitle)}`,
    '    action: add',
  ];
  if (goal) {
    lines.push(`    story: ${yamlStr(goal)}`);
  }
  lines.push(
    '    submodules: []         # LLM: fill in submodule entries',
    '',
    '# Cross-feature edges (leave empty for single-feature proposals)',
    'edges: []                  # LLM: fill in edge entries',
    '',
  );

  try {
    fs.mkdirSync(outputDirPath, { recursive: true });
    fs.writeFileSync(outputPath, lines.join(adapter.EOL), 'utf8');
    stdout.write(`${outputPath}\n`);
  } catch (e: any) {
    throw new SystemError(`Error writing proposal.yaml: ${e.message}`);
  }

  // Try to enrich with CodeGraph API listing
  try {
    const cgRequire = createRequire(import.meta.url);
    const { CodeGraph } = cgRequire('@colbymchenry/codegraph');
    const projectRoot = process.cwd();
    if (CodeGraph.isInitialized(projectRoot)) {
      const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
      const nodes = cg.getNodesByKind('function');
      const apiLines: string[] = [
        '',
        '# CodeGraph API index found — detected APIs (up to 50):',
      ];
      for (let i = 0; i < Math.min(nodes.length, 50); i++) {
        const n = nodes[i];
        apiLines.push(
          `#   ${n.name}  (${n.isExported ? 'exported' : 'internal'})  ${n.filePath}:${n.startLine}`,
        );
      }
      apiLines.push('#');
      const existing = fs.readFileSync(outputPath, 'utf8');
      fs.writeFileSync(outputPath, apiLines.join(adapter.EOL) + adapter.EOL + existing);
      cg.close();
    }
  } catch {
    // CodeGraph not installed or errored — skip silently
  }

  return 0;
}

// ── Handler entrypoint ───────────────────────────────────────────────────────

/**
 * architectureHandler — Known carryover from the createToolRunner migration.
 *
 * Reason for not using createToolRunner:
 * - Mixed TS/JS dispatch: "apply" and "template" subcommands use TypeScript
 *   with AppError throws. Other subcommands delegate to the JS atlas CLI
 *   (cli.js) which has its own error handling.
 * - Subcommand-level flag parsing: Each subcommand has unique flags; a single
 *   ToolSchema can't express this. See DESIGN.md §2.3 for the full picture.
 *
 * Error handling: All TS paths throw UserInputError/SystemError. JS paths are
 * handled by cli.dispatch()'s internal catch.
 */
export async function architectureHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  // Intercept apply / template before passing through to the JS CLI
  const first = args[0] || '';
  if (first === 'apply') return await handleApply(args.slice(1), context);
  if (first === 'template') return await handleTemplate(args.slice(1), context);

  // Delegate to the existing atlas CLI (still in JS)
  const sourceRoot =
    context.sourceRoot ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const cliPath = path.join(
    sourceRoot,
    'skills',
    'init-project-html',
    'lib',
    'atlas',
    'cli.js',
  );

  // Use file URL for ESM import compatibility on Windows — import() requires forward slashes.
  const cliModule = await import(pathToFileURL(cliPath).href);
  const cli = cliModule.default;
  return cli.dispatch(args, {
    stdout: context.stdout || process.stdout,
    stderr: context.stderr || process.stderr,
  });
}

export const tool: ToolDefinition = {
  name: 'architecture',
  category: 'Planning & architecture',
  skill: 'init-project-html',
  description: 'Open the project HTML architecture atlas, or render a paginated diff (`architecture diff`).',
  handler: architectureHandler,
};
