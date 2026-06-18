import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createToolRunner,
  UserInputError,
  SystemError,
} from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  const stream = new EventEmitter();
  stream.write = (chunk) => {
    data += chunk;
    return true;
  };
  stream.toString = () => data;
  return stream;
}

test('UserInputError is written without Error: prefix (FIX-01 regression)', async () => {
  const schema = {
    options: {},
    handler: () => {
      throw new UserInputError('invalid input');
    },
  };

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const runner = createToolRunner(schema);
  const code = await runner([], { stdout, stderr });

  assert.equal(code, 1);
  assert.equal(stderr.toString().replace(/\r/g, ''), 'invalid input\n');
});

test('SystemError includes stack trace in stderr (FIX-01 regression)', async () => {
  const schema = {
    options: {},
    handler: () => {
      throw new SystemError('disk failure');
    },
  };

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const runner = createToolRunner(schema);
  const code = await runner([], { stdout, stderr });

  assert.equal(code, 1);
  assert.ok(stderr.toString().replace(/\r/g, '').includes('disk failure\n'));
  assert.ok(stderr.toString().includes('at '));
});

test('Generic Error keeps Error: prefix (unchanged by FIX-01)', async () => {
  const schema = {
    options: {},
    handler: () => {
      throw new Error('generic error');
    },
  };

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const runner = createToolRunner(schema);
  const code = await runner([], { stdout, stderr });

  assert.equal(code, 1);
  assert.equal(stderr.toString().replace(/\r/g, ''), 'Error: generic error\n');
});

test('Successful execution returns 0 with no stderr', async () => {
  const schema = {
    options: {},
    handler: () => 0,
  };

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const runner = createToolRunner(schema);
  const code = await runner([], { stdout, stderr });

  assert.equal(code, 0);
  assert.equal(stderr.toString(), '');
});
