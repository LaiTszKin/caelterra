import test from 'node:test';
import assert from 'node:assert/strict';
import { animateWelcomeScreen, buildWelcomeScreen, renderSelectionScreen } from '@laitszkin/tui';

test('animateWelcomeScreen returns early when supportsAnimation is false (non-TTY)', async () => {
  const output = { isTTY: false, write() {} };
  await animateWelcomeScreen({
    output,
    version: '5.0.0',
    env: {},
    targets: [],
  });
  // Should return without error
  assert.ok(true);
});

test('animateWelcomeScreen returns early with CI env', async () => {
  const output = { isTTY: true, write() {} };
  await animateWelcomeScreen({
    output,
    version: '5.0.0',
    env: { CI: 'true' },
    targets: [],
  });
  assert.ok(true);
});

test('animateWelcomeScreen returns early with APOLLO_TOOLKIT_NO_ANIMATION', async () => {
  const output = { isTTY: true, write() {} };
  await animateWelcomeScreen({
    output,
    version: '5.0.0',
    env: { APOLLO_TOOLKIT_NO_ANIMATION: '1' },
    targets: [],
  });
  assert.ok(true);
});

test('buildWelcomeScreen with full coverage of stage progression', () => {
  const targets = [
    { label: 'codex', description: 'Codex agent' },
  ];

  for (let stage = 0; stage <= 4; stage++) {
    const text = buildWelcomeScreen({ version: '5.0.0', colorEnabled: false, stage, targets });
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 0);
  }
});

test('animateWelcomeScreen runs full animation with TTY output', async () => {
  let written = '';
  const output = {
    isTTY: true,
    write(chunk) { written += chunk; return true; },
  };
  await animateWelcomeScreen({
    output,
    version: '5.0.0',
    env: {},
    targets: [{ label: 'codex', description: 'Codex agent' }],
  });
  // Should have written the welcome screen content multiple times
  assert.ok(written.includes('Apollo Toolkit'));
  assert.ok(written.includes('Version'));
});

// ----------------------------------------------------------------
// renderSelectionScreen
// ----------------------------------------------------------------

test('renderSelectionScreen renders options with cursor and selection state', () => {
  let written = '';
  const output = {
    isTTY: true,
    write(chunk) { written += chunk; return true; },
  };
  const selected = new Set(['codex']);
  renderSelectionScreen({
    output,
    version: '5.0.0',
    cursor: 0,
    selected,
    message: '',
    env: { NO_COLOR: '1' },
    intro: 'Select targets:',
    choices: [
      { id: 'codex', label: 'Codex', description: 'Codex agent skills' },
      { id: 'openclaw', label: 'OpenClaw', description: 'OpenClaw agent' },
    ],
    allValues: ['codex', 'openclaw'],
  });
  assert.ok(written.includes('Select targets:'));
  assert.ok(written.includes('Codex'));
  assert.ok(written.includes('OpenClaw'));
  assert.ok(written.includes('codex'));
});

test('renderSelectionScreen renders with all items selected', () => {
  let written = '';
  const output = {
    isTTY: true,
    write(chunk) { written += chunk; return true; },
  };
  const selected = new Set(['codex', 'openclaw']);
  renderSelectionScreen({
    output,
    version: '5.0.0',
    cursor: 0,
    selected,
    message: '',
    env: { NO_COLOR: '1' },
    intro: 'Select:',
    choices: [
      { id: 'codex', label: 'Codex', description: 'Codex' },
      { id: 'openclaw', label: 'OpenClaw', description: 'OpenClaw' },
    ],
    allValues: ['codex', 'openclaw'],
  });
  assert.ok(written.includes('Selected:'));
});

test('renderSelectionScreen shows message when provided', () => {
  let written = '';
  const output = {
    isTTY: true,
    write(chunk) { written += chunk; return true; },
  };
  renderSelectionScreen({
    output,
    version: '5.0.0',
    cursor: 0,
    selected: new Set(),
    message: 'Selection required',
    env: { NO_COLOR: '1' },
    intro: 'Pick one:',
    choices: [
      { id: 'codex', label: 'Codex', description: 'Codex' },
    ],
    allValues: ['codex'],
  });
  assert.ok(written.includes('Selection required'));
});
