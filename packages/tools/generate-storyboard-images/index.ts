import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { parseArgs } from 'node:util';
import { UserInputError, SystemError } from '@laitszkin/tool-utils';

interface StoryboardArgs {
  contentName: string | null;
  projectDir: string;
  envFile: string | null;
  apiUrl: string | null;
  apiKey: string | null;
  promptsFile: string | null;
  prompts: string[];
  imageModel: string | null;
  aspectRatio: string | null;
  imageSize: string | null;
  quality: string | null;
  style: string | null;
  help: boolean;
}

function parseCliArgs(args: string[]): StoryboardArgs {
  const { values, positionals } = parseArgs({
    options: {
      'input': { type: 'string' },
      'content-name': { type: 'string' },
      'project-dir': { type: 'string', default: '.' },
      'env-file': { type: 'string' },
      'api-url': { type: 'string' },
      'api-key': { type: 'string' },
      'prompts-file': { type: 'string' },
      'prompt': { type: 'string', multiple: true },
      'image-model': { type: 'string' },
      'aspect-ratio': { type: 'string' },
      'image-size': { type: 'string' },
      'size': { type: 'string' },
      'quality': { type: 'string' },
      'style': { type: 'string' },
      'help': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const contentName = (values['input'] as string | undefined) ||
    (values['content-name'] as string | undefined) ||
    positionals[0] ||
    null;

  return {
    contentName,
    projectDir: (values['project-dir'] as string) || '.',
    envFile: (values['env-file'] as string | undefined) ?? null,
    apiUrl: (values['api-url'] as string | undefined) ?? null,
    apiKey: (values['api-key'] as string | undefined) ?? null,
    promptsFile: (values['prompts-file'] as string | undefined) ?? null,
    prompts: (values['prompt'] as string[] | undefined) || [],
    imageModel: (values['image-model'] as string | undefined) ?? null,
    aspectRatio: (values['aspect-ratio'] as string | undefined) ?? null,
    imageSize: (values['image-size'] as string | undefined) || (values['size'] as string | undefined) || null,
    quality: (values['quality'] as string | undefined) ?? null,
    style: (values['style'] as string | undefined) ?? null,
    help: !!values['help'],
  };
}

function sanitizeComponent(name: string, fallback: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]|[._]$/g, '') || fallback;
}

function uniquePath(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let index = 2;
  while (fs.existsSync(path.join(dir, `${base}_${index}${ext}`))) {
    index++;
  }
  return path.join(dir, `${base}_${index}${ext}`);
}

function postJson(
  baseUrl: string,
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
    const urlObj = new URL(url);
    const body = JSON.stringify(payload);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 180000,
    };

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timed out')); });
    req.write(body);
    req.end();
  });
}

function fetchBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    client.get(url, { timeout: 180000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parsePromptEntries(raw: unknown[]): Array<{ title: string; prompt: string }> {
  const items: Array<{ title: string; prompt: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === 'string') {
      const prompt = item.trim();
      if (!prompt) throw new Error(`Empty prompt at index ${i}`);
      items.push({ title: `scene-${i + 1}`, prompt });
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const prompt = String(obj.prompt || '').trim();
      const title = String(obj.title || `scene-${i + 1}`).trim() || `scene-${i + 1}`;
      if (!prompt) throw new Error(`Empty prompt in object at index ${i}`);
      items.push({ title, prompt });
    } else {
      throw new Error(`Invalid item type at index ${i}: expected string or object`);
    }
  }
  if (items.length === 0) throw new Error('No prompts found.');
  return items;
}

function parsePromptsFile(filePath: string): Array<{ title: string; prompt: string }> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (Array.isArray(raw)) {
    return parsePromptEntries(raw);
  }

  if (raw && typeof raw === 'object') {
    const scenes = raw.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error('Object mode requires a top-level "scenes" array.');
    }

    const characters: Record<string, Record<string, string>> = {};
    if (Array.isArray(raw.characters)) {
      for (const char of raw.characters) {
        if (!char || typeof char !== 'object') continue;
        const c = char as Record<string, unknown>;
        const id = String(c.id || '').trim();
        if (id) {
          characters[id] = {
            name: String(c.name || ''),
            appearance: String(c.appearance || ''),
            outfit: String(c.outfit || ''),
            description: String(c.description || ''),
          };
        }
      }
    }

    const items: Array<{ title: string; prompt: string }> = [];
    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si] as Record<string, unknown>;
      if (!scene || typeof scene !== 'object') {
        throw new Error(`Invalid scene at index ${si}: expected object.`);
      }

      const title = String(scene.title || `scene-${si + 1}`).trim() || `scene-${si + 1}`;
      const description = String(scene.description || '').trim();
      if (!description) throw new Error(`Scene ${si}: 'description' is required.`);

      let promptPayload: Record<string, unknown> = {
        scene_title: title,
        description,
      };

      const characterIds: string[] = [];
      if (Array.isArray(scene.character_ids)) {
        for (const cid of scene.character_ids) {
          characterIds.push(String(cid).trim());
        }
        const sceneChars = characterIds
          .map((cid) => characters[cid])
          .filter(Boolean);
        if (sceneChars.length > 0) {
          promptPayload.characters = sceneChars;
        }
      }

      if (scene.style) promptPayload.style = String(scene.style);
      if (scene.camera) promptPayload.camera = String(scene.camera);
      if (scene.lighting) promptPayload.lighting = String(scene.lighting);

      items.push({
        title,
        prompt: JSON.stringify(promptPayload, undefined, 0),
      });
    }
    return items;
  }

  throw new Error('Top-level JSON must be an array or an object.');
}

export async function generateStoryboardImagesHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  try {
    const opts = parseCliArgs(args);

    if (opts.help) {
      stdout.write(`Usage: apltk generate-storyboard-images --input <name> [options]

Generate storyboard images from prompts via OpenAI-compatible API.

Options:
  --input, --content-name <name>  Output subfolder name under pictures/
  --project-dir <path>            Project root (default: .)
  --env-file <path>               Path to .env file
  --api-url <url>                 API base URL for /images/generations
  --api-key <key>                 API key
  --prompts-file <path>           JSON file with prompt entries
  --prompt <text>                 Image prompt (repeatable)
  --image-model <model>           Image model (default: gpt-image-1)
  --aspect-ratio <ratio>          Aspect ratio, e.g. 16:9
  --image-size <size>             Image size, e.g. 1024x768
  --quality <q>                   Image quality
  --style <style>                 Image style

Either --prompts-file or at least one --prompt is required.
`);
      return 0;
    }

    if (!opts.contentName) {
      throw new UserInputError('--input or --content-name is required.');
    }

    const projectDir = path.resolve(opts.projectDir);
    const contentName = opts.contentName;

    // Resolve API config
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const sourceRoot = context.sourceRoot || path.resolve(__dirname, '..', '..');

    // Try loading env file
    const envFilePath = opts.envFile
      ? path.resolve(opts.envFile)
      : path.join(sourceRoot, 'openai-text-to-image-storyboard', '.env');
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        let key = trimmed.slice(0, eqIndex).trim();
        let val = trimmed.slice(eqIndex + 1).trim();
        if (key.startsWith('export ')) key = key.slice(7).trim();
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }

    const apiUrl = opts.apiUrl || process.env.OPENAI_API_URL || '';
    const apiKey = opts.apiKey || process.env.OPENAI_API_KEY || '';
    const imageModel = opts.imageModel || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const aspectRatio = opts.aspectRatio || process.env.OPENAI_IMAGE_RATIO || process.env.OPENAI_IMAGE_ASPECT_RATIO || null;
    const imageSize = opts.imageSize || process.env.OPENAI_IMAGE_SIZE || null;
    const quality = opts.quality || process.env.OPENAI_IMAGE_QUALITY || null;
    const style = opts.style || process.env.OPENAI_IMAGE_STYLE || null;

    if (!apiUrl) {
      throw new UserInputError('Missing API URL. Set --api-url or OPENAI_API_URL.');
    }
    if (!apiKey) {
      throw new UserInputError('Missing API key. Set --api-key or OPENAI_API_KEY.');
    }

    // Build prompt items
    let promptItems: Array<{ title: string; prompt: string }>;
    if (opts.promptsFile) {
      promptItems = parsePromptsFile(path.resolve(opts.promptsFile));
    } else if (opts.prompts.length > 0) {
      promptItems = opts.prompts.map((p, i) => ({ title: `scene-${i + 1}`, prompt: p.trim() }));
    } else {
      throw new UserInputError('Either --prompts-file or at least one --prompt is required.');
    }

    if (promptItems.length === 0) {
      throw new UserInputError('No prompts provided.');
    }

    const outputDir = path.join(projectDir, 'pictures', sanitizeComponent(contentName, 'untitled-content'));
    fs.mkdirSync(outputDir, { recursive: true });

    const records: Array<Record<string, unknown>> = [];

    for (let i = 0; i < promptItems.length; i++) {
      const item = promptItems[i];
      const titleSlug = sanitizeComponent(item.title, `scene-${i + 1}`);
      const imagePath = uniquePath(path.join(outputDir, `${String(i + 1).padStart(2, '0')}_${titleSlug}.png`));

      const payload: Record<string, unknown> = {
        model: imageModel,
        prompt: item.prompt,
      };
      if (aspectRatio) payload.aspect_ratio = aspectRatio;
      if (imageSize) payload.size = imageSize;
      if (quality) payload.quality = quality;
      if (style) payload.style = style;

      const response = await postJson(apiUrl, '/images/generations', apiKey, payload);

      const data = response.data;
      if (!Array.isArray(data) || data.length === 0) {
        stderr.write(`Error: No image data returned for prompt ${i + 1}.\n`);
        continue;
      }

      const first = data[0] as Record<string, unknown>;
      let imageBytes: Buffer;

      if (typeof first.b64_json === 'string') {
        imageBytes = Buffer.from(first.b64_json, 'base64');
      } else if (typeof first.url === 'string') {
        imageBytes = await fetchBinary(first.url);
      } else {
        stderr.write(`Error: Image payload missing b64_json/url for prompt ${i + 1}.\n`);
        continue;
      }

      fs.writeFileSync(imagePath, imageBytes);

      const record: Record<string, unknown> = {
        index: i + 1,
        title: item.title,
        prompt: item.prompt,
        file: imagePath,
      };
      if (typeof first.revised_prompt === 'string') {
        record.revised_prompt = first.revised_prompt;
      }
      records.push(record);
      stdout.write(`[OK] Generated ${imagePath}\n`);
    }

    // Write summary
    const summary: Record<string, unknown> = {
      content_name: contentName,
      project_dir: projectDir,
      output_dir: outputDir,
      image_model: imageModel,
      images: records,
    };
    if (aspectRatio) summary.aspect_ratio = aspectRatio;
    if (imageSize) summary.image_size = imageSize;

    const summaryPath = path.join(outputDir, 'storyboard.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    stdout.write(`[OK] Wrote plan to ${summaryPath}\n`);

    return 0;
  } catch (err: unknown) {
    if (err instanceof UserInputError) {
      stderr.write(`${err.message}\n`);
    } else if (err instanceof SystemError) {
      stderr.write(`${err.message}\n${err.stack}\n`);
    } else {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      stderr.write(`Error: ${msg}\n`);
    }
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'generate-storyboard-images',
  category: 'media',
  description: 'Generate storyboard images from prompts via OpenAI-compatible API.',
  handler: generateStoryboardImagesHandler,
};
