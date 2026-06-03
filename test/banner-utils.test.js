import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWordmark, buildBanner, buildSupportedTargetLines, buildWelcomeScreen } from '@laitszkin/tui';

test('buildWordmark returns ASCII art with color codes when enabled', () => {
  const result = buildWordmark({ colorEnabled: true });
  // Wordmark is ASCII art that spells "Apollo" visually
  assert.ok(result.includes('_____') || result.includes('/ ___'));
  assert.ok(result.includes('\x1b[') || result.includes('['));
});

test('buildWordmark returns plain text when color is disabled', () => {
  const result = buildWordmark({ colorEnabled: false });
  // Wordmark is ASCII art that spells "Apollo" visually
  assert.ok(result.includes('_____') || result.includes('/ ___'));
  assert.ok(!result.includes('\x1b['));
});

test('buildBanner includes wordmark, title, subtitle, and version', () => {
  const result = buildBanner({ version: '5.0.0', colorEnabled: false });
  assert.ok(result.includes('Apollo Toolkit'));
  assert.ok(result.includes('Version 5.0.0'));
  assert.ok(result.includes('Codex'));
});

test('buildBanner returns text with ANSI codes when color is enabled', () => {
  const result = buildBanner({ version: '5.0.0', colorEnabled: true });
  assert.ok(result.includes('\x1b[') || result.includes('['));
});

test('buildSupportedTargetLines formats targets with padding', () => {
  const targets = [
    { label: 'codex', description: 'Codex agent' },
    { label: 'openclaw', description: 'OpenClaw agent' },
    { label: 'trae', description: 'Trae agent' },
  ];
  const result = buildSupportedTargetLines({ targets, colorEnabled: false });
  assert.ok(result.includes('codex'));
  assert.ok(result.includes('Codex agent'));
  assert.ok(result.includes('openclaw'));
  assert.ok(result.includes('OpenClaw agent'));
  assert.ok(result.includes('trae'));
  assert.ok(result.includes('Trae agent'));
});

test('buildSupportedTargetLines pads labels to align descriptions', () => {
  const targets = [
    { label: 'a', description: 'Short label' },
    { label: 'longlabel', description: 'Long label' },
  ];
  const result = buildSupportedTargetLines({ targets, colorEnabled: false });
  const lines = result.split('\n');
  // Both lines should have their descriptions aligned (same column)
  const aLine = lines.find((l) => l.includes('Short label'));
  const longLine = lines.find((l) => l.includes('Long label'));
  const aDescIdx = aLine.indexOf('Short label');
  const longDescIdx = longLine.indexOf('Long label');
  assert.equal(aDescIdx, longDescIdx, 'Descriptions should be aligned');
});

test('buildWelcomeScreen stage 0 shows only banner', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 0 });
  assert.ok(result.includes('Apollo Toolkit'));
  assert.ok(!result.includes('This setup will configure'));
});

test('buildWelcomeScreen stage 1 shows configuration info', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 1 });
  assert.ok(result.includes('This setup will configure'));
  assert.ok(!result.includes('Quick start'));
});

test('buildWelcomeScreen stage 2 shows quick start', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 2 });
  assert.ok(result.includes('Quick start'));
  assert.ok(!result.includes('Supported targets'));
});

test('buildWelcomeScreen stage 3 with targets shows supported targets', () => {
  const targets = [{ label: 'codex', description: 'Codex agent' }];
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 3, targets });
  assert.ok(result.includes('Supported targets'));
  assert.ok(result.includes('codex'));
  assert.ok(!result.includes('Launching target selector'));
});

test('buildWelcomeScreen stage 3 without targets omits target section', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 3, targets: [] });
  assert.ok(!result.includes('Supported targets'));
});

test('buildWelcomeScreen stage 4 shows selector launch', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage: 4 });
  assert.ok(result.includes('Launching target selector'));
});

test('buildWelcomeScreen with color enabled has ANSI codes', () => {
  const result = buildWelcomeScreen({ version: '5.0.0', colorEnabled: true, stage: 4 });
  assert.ok(result.includes('\x1b[') || result.includes('['));
});
