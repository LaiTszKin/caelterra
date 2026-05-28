import fs from 'node:fs';
import path from 'node:path';

export function iterSkillDirs(root: string): string[] {
  const skillsDir = path.join(root, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir)
    .filter((name) => {
      const full = path.join(skillsDir, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'SKILL.md'));
    })
    .map((name) => path.join(skillsDir, name))
    .sort();
}
