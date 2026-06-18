import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createToolRunner, AppError } from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  const stream = new EventEmitter();
  stream.write = (chunk) => {
    data += chunk;
    return true;
  };
  stream.toString = () => data;
  stream.resume = () => {};
  stream.pause = () => {};
  return stream;
}

describe('SchemaOption multiple support', () => {
  it('collects multiple --tag values into an array', async () => {
    const schema = {
      options: {
        tag: { type: 'string', multiple: true },
      },
      handler: async (values) => {
        assert.ok(Array.isArray(values.tag));
        assert.strictEqual(values.tag[0], 'a');
        assert.strictEqual(values.tag[1], 'b');
        assert.strictEqual(values.tag.length, 2);
      },
    };
    const runner = createToolRunner(schema);
    const exitCode = await runner(['--tag', 'a', '--tag', 'b'], {
      stdout: createMemoryStream(),
      stderr: createMemoryStream(),
    });
    assert.strictEqual(exitCode, undefined);
  });

  it('handles single value for multiple option', async () => {
    const schema = {
      options: {
        label: { type: 'string', multiple: true },
      },
      handler: async (values) => {
        assert.ok(Array.isArray(values.label));
        assert.strictEqual(values.label[0], 'bug');
        assert.strictEqual(values.label.length, 1);
      },
    };
    const runner = createToolRunner(schema);
    const exitCode = await runner(['--label', 'bug'], {
      stdout: createMemoryStream(),
      stderr: createMemoryStream(),
    });
    assert.strictEqual(exitCode, undefined);
  });
});

describe('createToolRunner catch with AppError base class', () => {
  it('returns exit code 1 and formats AppError with "Error:" prefix', async () => {
    const schema = {
      options: {},
      handler: async () => {
        throw new AppError('base app error');
      },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(
      stderr.toString().replace(/\r/g, ''),
      'Error: base app error\n',
    );
  });
});
