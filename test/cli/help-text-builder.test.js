// Section-coverage coverage (Req 5): all four HelpTextBuilder methods are already
// verified for their required key sections by existing tests below:
//   - overview()   → Usage, Common goals, Bundled tools, Examples, Options   (line 9)
//   - install()    → Usage, Supported targets, Behavior notes, Options, Examples (line 41)
//   - uninstall()  → Usage, Supported targets, Behavior notes, Options, Examples (line 66)
//   - toolsHelp()  → Usage, Bundled tools, Tip, Examples                    (line 88)
// No additional section-assertion tests are needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { HelpTextBuilder } from '../../packages/cli/dist/help-text-builder.js';

function stripAnsi(str) {
  return str.replace(/\[\d+(;\d+)*m/g, '');
}

test('overview() contains Usage, Common goals, Bundled tools, Examples, and Options sections', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).overview();
  assert.match(text, /Usage:/);
  assert.match(text, /Common goals:/);
  assert.match(text, /Bundled tools:/);
  assert.match(text, /Examples:/);
  assert.match(text, /Options:/);
});

test('overview() includes version in banner', () => {
  const text = new HelpTextBuilder({ version: '4.2.0', colorEnabled: false }).overview();
  assert.match(text, /Version 4\.2\.0/);
});

test('overview() includes usage lines for all invocation forms', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).overview();
  assert.match(text, /apltk \[install\]/);
  assert.match(text, /apollo-toolkit/);
  assert.match(text, /apltk uninstall/);
  assert.match(text, /apltk tools/);
  assert.match(text, /apltk <tool>/);
  assert.match(text, /--help/);
});

test('overview() shows valid installation mode alternatives', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).overview();
  const modes = ['codex', 'openclaw', 'trae', 'agents', 'claude-code', 'all'];
  for (const mode of modes) {
    assert.ok(text.includes(mode), `overview() should contain mode "${mode}"`);
  }
});

test('install() contains Usage, Supported targets, Behavior notes, Options, and Examples sections', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).install();
  assert.match(text, /Usage:/);
  assert.match(text, /Supported targets:/);
  assert.match(text, /Behavior notes:/);
  assert.match(text, /Options:/);
  assert.match(text, /Examples:/);
  assert.match(text, /Use this when:/);
});

test('install() includes target labels for all definitions', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).install();
  const labels = ['Codex', 'OpenClaw', 'Trae', 'Agents', 'Claude Code'];
  for (const label of labels) {
    assert.ok(text.includes(label), `install() should contain target label "${label}"`);
  }
});

test('install() includes symlink and copy option flags', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).install();
  assert.match(text, /--symlink/);
  assert.match(text, /--copy/);
  assert.match(text, /--home/);
});

test('uninstall() contains Usage, Supported targets, Behavior notes, Options, and Examples sections', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).uninstall();
  assert.match(text, /Usage:/);
  assert.match(text, /Supported targets:/);
  assert.match(text, /Behavior notes:/);
  assert.match(text, /Options:/);
  assert.match(text, /Examples:/);
  assert.match(text, /Use this when:/);
});

test('uninstall() includes --yes and -y option flags', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).uninstall();
  assert.match(text, /--yes/);
  assert.match(text, /-y/);
});

test('uninstall() describes removal of manifest-tracked installs', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).uninstall();
  assert.match(text, /manifest-tracked/);
  assert.match(text, /confirmation/);
});

test('toolsHelp() contains Usage, Bundled tools, Common goals, Tip, and Examples sections', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).toolsHelp();
  assert.match(text, /Usage:/);
  assert.match(text, /Bundled tools:/);
  assert.match(text, /Common goals:/);
  assert.match(text, /Tip:/);
  assert.match(text, /Examples:/);
});

test('toolsHelp() includes tools usage lines', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).toolsHelp();
  assert.match(text, /apltk tools/);
  assert.match(text, /apltk <tool>/);
  assert.match(text, /--help/);
});

test('toolsHelp() mentions next-step discovery', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false }).toolsHelp();
  assert.match(text, /Next step:/);
  assert.match(text, /apltk tools <tool> --help/);
});

test('colorEnabled=false produces no ANSI escape codes in any section', () => {
  const builder = new HelpTextBuilder({ version: '1.0.0', colorEnabled: false });
  assert.doesNotMatch(builder.overview(), /\[/);
  assert.doesNotMatch(builder.install(), /\[/);
  assert.doesNotMatch(builder.uninstall(), /\[/);
  assert.doesNotMatch(builder.toolsHelp(), /\[/);
});

test('colorEnabled=true produces ANSI escape codes in overview section', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: true }).overview();
  assert.match(text, /\[/);
  assert.match(stripAnsi(text), /Usage:/);
  assert.match(stripAnsi(text), /Common goals:/);
});

test('colorEnabled=true produces ANSI escape codes in install section', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: true }).install();
  assert.match(text, /\[/);
  assert.match(stripAnsi(text), /Supported targets:/);
});

test('colorEnabled=true produces ANSI escape codes in uninstall section', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: true }).uninstall();
  assert.match(text, /\[/);
  assert.match(stripAnsi(text), /Behavior notes:/);
});

test('colorEnabled=true produces ANSI escape codes in toolsHelp section', () => {
  const text = new HelpTextBuilder({ version: '1.0.0', colorEnabled: true }).toolsHelp();
  assert.match(text, /\[/);
  assert.match(stripAnsi(text), /Bundled tools:/);
});
