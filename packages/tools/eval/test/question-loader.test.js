import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const originalQuestion = {
  id: 'Q001',
  userPrompt: 'Write a spec for user login flow',
  difficulty: 'basic',
  projectContext: { description: 'Test project', files: [] },
  scoringCriteria: {
    outcome: {
      weight: 0.3,
      checks: [
        {
          id: 'o1',
          description: 'Complete task',
          passCondition: 'Output exists',
        },
      ],
    },
    process: {
      weight: 0.3,
      checks: [
        {
          id: 'p1',
          description: 'Follow process',
          passCondition: 'Steps done',
        },
      ],
    },
    style: {
      weight: 0.2,
      checks: [
        {
          id: 's1',
          description: 'Correct format',
          passCondition: 'Valid format',
        },
      ],
    },
    efficiency: {
      weight: 0.2,
      checks: [{ id: 'e1', description: 'Efficient', passCondition: 'Quick' }],
    },
  },
};

describe('REGTEST-F: generateVariants', () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  id: 'Q001_v1',
                  userPrompt: 'Write a spec for handling user authentication',
                },
              ]),
            },
          },
        ],
      }),
    });
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('should generate variants preserving scoring criteria and difficulty', async () => {
    const { generateVariants } = await import('../dist/lib/question-utils.js');

    const mockEnv = {
      JUDGE_BASE_URL: 'http://localhost:9999',
      JUDGE_MODEL: 'test-model',
      JUDGE_API_KEY: 'test-key',
    };

    const variants = await generateVariants(originalQuestion, 1, mockEnv);

    assert.ok(variants.length > 0, 'Should generate at least 1 variant');

    // Verify scoring criteria is deeply preserved
    assert.deepStrictEqual(
      variants[0].scoringCriteria,
      originalQuestion.scoringCriteria,
      'Variant should preserve original scoring criteria',
    );

    // Verify difficulty is preserved
    assert.equal(
      variants[0].difficulty,
      originalQuestion.difficulty,
      'Variant should preserve difficulty',
    );

    // Verify projectContext is preserved
    assert.deepStrictEqual(
      variants[0].projectContext,
      originalQuestion.projectContext,
      'Variant should preserve projectContext',
    );

    // Verify userPrompt is different (rewritten)
    assert.notEqual(
      variants[0].userPrompt,
      originalQuestion.userPrompt,
      'Variant should have rewritten userPrompt',
    );

    // Verify id reflects origin
    assert.ok(
      variants[0].id.startsWith(originalQuestion.id + '_v'),
      `Variant id "${variants[0].id}" should start with "${originalQuestion.id}_v"`,
    );
  });

  it('should return empty array when LLM returns unparseable response', async () => {
    const { generateVariants } = await import('../dist/lib/question-utils.js');

    // Override fetch to return garbage
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not valid json at all' } }],
      }),
    });

    const variants = await generateVariants(originalQuestion, 1, {
      JUDGE_BASE_URL: 'http://localhost:9999',
      JUDGE_MODEL: 'test-model',
      JUDGE_API_KEY: 'test-key',
    });

    assert.ok(
      Array.isArray(variants),
      'Should return array even on parse failure',
    );
    assert.equal(
      variants.length,
      0,
      'Should return empty array on parse failure',
    );
  });
});
