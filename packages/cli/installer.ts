import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { InstallMode, InstallTarget, ManifestData, SyncResult } from './types.js';

export interface TargetDefinition {
  id: InstallMode;
  label: string;
  description: string;
}

export const TARGET_DEFINITIONS: readonly TargetDefinition[] = Object.freeze([
  { id: 'codex', label: 'Codex', description: '~/.codex/skills' },
  { id: 'openclaw', label: 'OpenClaw', description: '~/.openclaw/workspace*/skills' },
  { id: 'trae', label: 'Trae', description: '~/.trae/skills' },
  { id: 'agents', label: 'Agents', description: '~/.agents/skills' },
  { id: 'claude-code', label: 'Claude Code', description: '~/.claude/skills' },
]);

export const VALID_MODES: readonly InstallMode[] = TARGET_DEFINITIONS.map(({ id }) => id);
const COPY_FILES = new Set(['AGENTS.md', 'CHANGELOG.md', 'LICENSE', 'README.md', 'package.json']);
const SKILLS_DIRNAME = 'skills';
export const MANIFEST_FILENAME = '.apollo-toolkit-manifest.json';

export function resolveHomeDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

export function expandUserPath(inputPath: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return resolveHomeDirectory(env);
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(resolveHomeDirectory(env), inputPath.slice(2));
  }
  return inputPath;
}

export function resolveToolkitHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.APOLLO_TOOLKIT_HOME) {
    return path.resolve(expandUserPath(env.APOLLO_TOOLKIT_HOME, env));
  }
  return path.join(resolveHomeDirectory(env), '.apollo-toolkit');
}

export function normalizeModes(inputModes: string[]): InstallMode[] {
  const modes: InstallMode[] = [];
  for (const rawMode of inputModes) {
    const mode = String(rawMode).toLowerCase();
    if (mode === 'all') {
      for (const candidate of VALID_MODES) {
        if (!modes.includes(candidate)) {
          modes.push(candidate);
        }
      }
      continue;
    }
    if (!(VALID_MODES as readonly string[]).includes(mode)) {
      throw new Error(`Invalid mode: ${rawMode}`);
    }
    if (!modes.includes(mode as InstallMode)) {
      modes.push(mode as InstallMode);
    }
  }
  return modes;
}

export async function listSkillNames(rootDir: string, modes: InstallMode[] = []): Promise<string[]> {
  const skillsDir = path.join(rootDir, SKILLS_DIRNAME);
  const entries = fs.existsSync(skillsDir)
    ? await fsp.readdir(skillsDir, { withFileTypes: true })
    : [];
  const skillNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))) {
      skillNames.add(entry.name);
    }
  }

  if (modes.includes('codex')) {
    const codexDir = path.join(rootDir, 'codex');
    if (fs.existsSync(codexDir)) {
      const codexEntries = await fsp.readdir(codexDir, { withFileTypes: true });
      for (const entry of codexEntries) {
        if (entry.isDirectory() && fs.existsSync(path.join(codexDir, entry.name, 'SKILL.md'))) {
          skillNames.add(entry.name);
        }
      }
    }
  }

  return [...skillNames].sort();
}

export async function listCodexSkillNames(rootDir: string): Promise<string[]> {
  const codexDir = path.join(rootDir, 'codex');
  if (!fs.existsSync(codexDir)) return [];

  const entries = await fsp.readdir(codexDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(codexDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

export async function readManifest(targetRoot: string): Promise<ManifestData | null> {
  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  try {
    const raw = await fsp.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isSafeSkillName(skillName: string): boolean {
  return typeof skillName === 'string'
    && skillName.length > 0
    && !skillName.includes('\0')
    && !skillName.includes('/')
    && !skillName.includes('\\')
    && !path.isAbsolute(skillName)
    && skillName !== '.'
    && skillName !== '..';
}

function getManifestSkillNames(manifest: ManifestData): string[] {
  return [...new Set([
    ...(Array.isArray(manifest.historicalSkills) ? manifest.historicalSkills : []),
    ...(Array.isArray(manifest.skills) ? manifest.skills : []),
  ])].filter(isSafeSkillName).sort();
}

export async function writeManifest(
  targetRoot: string,
  { version, linkMode, skills, previousSkills = [] }: { version: string; linkMode: string; skills: string[]; previousSkills?: string[] },
): Promise<void> {
  const historicalSkills = [...new Set([...previousSkills, ...skills])].sort();
  const manifest: ManifestData = {
    version,
    installedAt: new Date().toISOString(),
    linkMode,
    skills: [...skills].sort(),
    historicalSkills,
  };
  await fsp.mkdir(targetRoot, { recursive: true });
  await fsp.writeFile(
    path.join(targetRoot, MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

export async function listAllKnownSkillNames({ toolkitHome, modes = [], env = process.env }: { toolkitHome: string; modes?: InstallMode[]; env?: NodeJS.ProcessEnv }): Promise<string[]> {
  const allNames = new Set<string>();
  const currentSkills = await listSkillNames(toolkitHome, modes).catch(() => []);
  for (const name of currentSkills) allNames.add(name);

  const targets = await getUninstallTargetRoots(modes, env);
  for (const target of targets) {
    if (!target.root) continue;
    const manifest = await readManifest(target.root);
    if (manifest && manifest.historicalSkills) {
      for (const name of getManifestSkillNames(manifest)) {
        allNames.add(name);
      }
    }
  }
  return [...allNames].sort();
}

function getTargetSkillNames({ targetMode, sharedSkillNames, codexSkillNames, includeExclusiveSkills = false }: {
  targetMode: string;
  sharedSkillNames: string[];
  codexSkillNames: string[];
  includeExclusiveSkills?: boolean;
}): string[] {
  const includeCodexSkills = targetMode === 'codex' || includeExclusiveSkills;
  if (!includeCodexSkills || codexSkillNames.length === 0) return sharedSkillNames;
  return [...new Set([...sharedSkillNames, ...codexSkillNames])].sort();
}

function resolveInstallSourcePath({ toolkitHome, targetMode, skillName, codexSkillNames }: {
  toolkitHome: string;
  targetMode: string;
  skillName: string;
  codexSkillNames: string[];
}): string {
  if (targetMode === 'codex' && codexSkillNames.includes(skillName)) {
    return path.join(toolkitHome, 'codex', skillName);
  }
  return path.join(toolkitHome, SKILLS_DIRNAME, skillName);
}

function shouldCopyEntry(entry: fs.Dirent): boolean {
  if (entry.isFile()) return COPY_FILES.has(entry.name);
  if (!entry.isDirectory()) return false;
  return entry.name === SKILLS_DIRNAME;
}

function shouldCopyCodexContainer(sourceRoot: string, entry: fs.Dirent, modes: InstallMode[]): boolean {
  if (entry.name !== 'codex' || !entry.isDirectory() || !modes.includes('codex')) return false;
  const codexDir = path.join(sourceRoot, entry.name);
  if (!fs.existsSync(codexDir)) return false;
  const childNames = fs.readdirSync(codexDir);
  return childNames.some((childName) => fs.existsSync(path.join(codexDir, childName, 'SKILL.md')));
}

async function stageToolkitContents({ sourceRoot, destinationRoot, version, modes = [] }: {
  sourceRoot: string;
  destinationRoot: string;
  version: string;
  modes?: InstallMode[];
}): Promise<string[]> {
  const entries = await fsp.readdir(sourceRoot, { withFileTypes: true });
  const copiedEntries: string[] = [];
  await fsp.mkdir(destinationRoot, { recursive: true });

  for (const entry of entries) {
    if (!shouldCopyEntry(entry) && !shouldCopyCodexContainer(sourceRoot, entry, modes)) continue;
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    await fsp.cp(sourcePath, destinationPath, { recursive: true, force: true });
    copiedEntries.push(entry.name);
  }

  const metadata = { version, installedAt: new Date().toISOString(), source: 'npm-package' };
  await fsp.writeFile(
    path.join(destinationRoot, '.apollo-toolkit-install.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  return copiedEntries.sort();
}

export async function syncToolkitHome({ sourceRoot, toolkitHome, version, modes = [] }: {
  sourceRoot: string;
  toolkitHome: string;
  version: string;
  modes?: InstallMode[];
}): Promise<SyncResult & { toolkitHome: string; skillNames: string[] }> {
  const parentDir = path.dirname(toolkitHome);
  const tempDir = path.join(parentDir, `.apollo-toolkit.tmp-${process.pid}-${Date.now()}`);
  const previousSkillNames = await listSkillNames(toolkitHome, modes).catch(() => []);

  await fsp.rm(tempDir, { recursive: true, force: true });
  await stageToolkitContents({ sourceRoot, destinationRoot: tempDir, version, modes });

  const stat = await fsp.lstat(toolkitHome).catch(() => null);
  if (stat && !stat.isDirectory()) {
    throw new Error(`Apollo Toolkit home exists but is not a directory: ${toolkitHome}`);
  }

  await fsp.rm(toolkitHome, { recursive: true, force: true });
  await fsp.mkdir(parentDir, { recursive: true });
  await fsp.rename(tempDir, toolkitHome);

  return {
    toolkitHome,
    previousSkillNames,
    skillNames: await listSkillNames(toolkitHome, modes),
  };
}

export async function getTargetRoots(modes: string[], env: NodeJS.ProcessEnv = process.env): Promise<InstallTarget[]> {
  const homeDir = resolveHomeDirectory(env);
  const targets: InstallTarget[] = [];

  for (const mode of normalizeModes(modes)) {
    if (mode === 'codex') {
      targets.push({
        id: mode,
        label: 'Codex',
        root: env.CODEX_SKILLS_DIR
          ? path.resolve(expandUserPath(env.CODEX_SKILLS_DIR, env))
          : path.join(homeDir, '.codex', 'skills'),
      });
      continue;
    }
    if (mode === 'trae') {
      targets.push({
        id: mode,
        label: 'Trae',
        root: env.TRAE_SKILLS_DIR
          ? path.resolve(expandUserPath(env.TRAE_SKILLS_DIR, env))
          : path.join(homeDir, '.trae', 'skills'),
      });
      continue;
    }
    if (mode === 'agents') {
      targets.push({
        id: mode,
        label: 'Agents',
        root: env.AGENTS_SKILLS_DIR
          ? path.resolve(expandUserPath(env.AGENTS_SKILLS_DIR, env))
          : path.join(homeDir, '.agents', 'skills'),
      });
      continue;
    }
    if (mode === 'openclaw') {
      const openclawHome = env.OPENCLAW_HOME
        ? path.resolve(expandUserPath(env.OPENCLAW_HOME, env))
        : path.join(homeDir, '.openclaw');
      const entries = await fsp.readdir(openclawHome, { withFileTypes: true }).catch(() => []);
      const workspaceNames = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('workspace'))
        .map((entry) => entry.name)
        .sort();
      if (workspaceNames.length === 0) {
        throw new Error(`No workspace directories found under: ${openclawHome}`);
      }
      for (const workspaceName of workspaceNames) {
        targets.push({
          id: mode,
          label: `OpenClaw (${workspaceName})`,
          root: path.join(openclawHome, workspaceName, 'skills'),
        });
      }
      continue;
    }
    if (mode === 'claude-code') {
      targets.push({
        id: mode,
        label: 'Claude Code',
        root: env.CLAUDE_CODE_SKILLS_DIR
          ? path.resolve(expandUserPath(env.CLAUDE_CODE_SKILLS_DIR, env))
          : path.join(homeDir, '.claude', 'skills'),
      });
      continue;
    }
  }
  return targets;
}

export async function getUninstallTargetRoots(modes: string[] = [...VALID_MODES], env: NodeJS.ProcessEnv = process.env): Promise<InstallTarget[]> {
  const targets: InstallTarget[] = [];
  for (const mode of normalizeModes(modes)) {
    try {
      targets.push(...await getTargetRoots([mode], env));
    } catch {
      // Uninstall is best-effort across agents
    }
  }
  return targets;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function replaceWithCopy(sourcePath: string, targetPath: string): Promise<void> {
  await fsp.rm(targetPath, { recursive: true, force: true });
  await ensureDirectory(path.dirname(targetPath));
  await fsp.cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function replaceWithSymlink(sourcePath: string, targetPath: string): Promise<void> {
  await fsp.rm(targetPath, { recursive: true, force: true });
  await ensureDirectory(path.dirname(targetPath));
  await fsp.symlink(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
}

export async function installLinks({ toolkitHome, modes, env = process.env, previousSkillNames = [], linkMode = 'copy', includeExclusiveSkills = false }: {
  toolkitHome: string;
  modes: InstallMode[];
  env?: NodeJS.ProcessEnv;
  previousSkillNames?: string[];
  linkMode?: 'copy' | 'symlink';
  includeExclusiveSkills?: boolean;
}): Promise<{ skillNames: string[]; targets: InstallTarget[]; copiedPaths: any[]; linkMode: string }> {
  const normalizedModes = normalizeModes(modes);
  const codexSkillNames = (normalizedModes.includes('codex') || includeExclusiveSkills)
    ? await listCodexSkillNames(toolkitHome)
    : [];
  const sharedSkillNames = await listSkillNames(toolkitHome);
  const skillNames = normalizedModes.includes('codex')
    ? [...new Set([...sharedSkillNames, ...codexSkillNames])].sort()
    : sharedSkillNames;
  const targets = await getTargetRoots(normalizedModes, env);
  const copiedPaths: any[] = [];

  for (const target of targets) {
    const targetSkillNames = getTargetSkillNames({
      targetMode: target.id,
      sharedSkillNames,
      codexSkillNames,
      includeExclusiveSkills,
    });

    const existingManifest = await readManifest(target.root!);
    const allPreviousSkills = existingManifest
      ? [...new Set([...getManifestSkillNames(existingManifest), ...previousSkillNames.filter(isSafeSkillName)])]
      : previousSkillNames.filter(isSafeSkillName);

    const staleSkillNames = allPreviousSkills.filter(
      (skillName) => !targetSkillNames.includes(skillName),
    );

    await ensureDirectory(target.root!);
    for (const staleSkillName of staleSkillNames) {
      await fsp.rm(path.join(target.root!, staleSkillName), { recursive: true, force: true });
    }
    for (const skillName of targetSkillNames) {
      const sourcePath = resolveInstallSourcePath({
        toolkitHome,
        targetMode: target.id,
        skillName,
        codexSkillNames,
      });
      const targetPath = path.join(target.root!, skillName);

      if (linkMode === 'symlink') {
        await replaceWithSymlink(sourcePath, targetPath);
      } else {
        await replaceWithCopy(sourcePath, targetPath);
      }
      copiedPaths.push({ target: target.label, path: targetPath, skillName, linkMode });
    }

    await writeManifest(target.root!, {
      version: existingManifest?.version || 'unknown',
      linkMode,
      skills: targetSkillNames,
      previousSkills: allPreviousSkills,
    });
  }

  return { skillNames, targets, copiedPaths, linkMode };
}

export async function uninstallSkills({ env = process.env, modes = null }: { env?: NodeJS.ProcessEnv; modes?: InstallMode[] | null } = {}): Promise<{ target: string; root: string; removedSkills: string[] }[]> {
  const normalizedModes = modes ? normalizeModes(modes) : [...VALID_MODES];
  const targets = await getUninstallTargetRoots(normalizedModes, env);
  const results: { target: string; root: string; removedSkills: string[] }[] = [];

  for (const target of targets) {
    const manifest = await readManifest(target.root!);
    if (!manifest) continue;

    const skillNames = getManifestSkillNames(manifest);
    const removedSkills: string[] = [];
    for (const skillName of skillNames) {
      const skillPath = path.join(target.root!, skillName);
      try {
        await fsp.rm(skillPath, { recursive: true, force: true });
        removedSkills.push(skillName);
      } catch {
        // skip
      }
    }

    try {
      await fsp.rm(path.join(target.root!, MANIFEST_FILENAME), { force: true });
    } catch {
      // ok
    }

    results.push({ target: target.label, root: target.root!, removedSkills });
  }

  return results;
}
