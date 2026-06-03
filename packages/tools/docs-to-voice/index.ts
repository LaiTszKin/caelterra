import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, SystemError, createToolRunner } from '@laitszkin/tool-utils';

const DEFAULT_API_ENDPOINT =
  'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const DEFAULT_API_MODEL = 'qwen3-tts';
const DEFAULT_API_VOICE = 'Cherry';

interface TimelineEntry {
  index: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  startMs: number;
  endMs: number;
}

function readInputText(inputFile: string | null, inputText: string | null): string {
  if (inputFile) {
    const inputPath = path.resolve(inputFile);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    return fs.readFileSync(inputPath, 'utf-8');
  }
  return inputText || '';
}

function splitSentences(rawText: string): string[] {
  const endings = new Set(['。', '！', '？', '!', '?', '；', ';']);
  const sentences: string[] = [];

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let current: string[] = [];
    for (const char of line) {
      current.push(char);
      if (endings.has(char)) {
        const sentence = current.join('').trim();
        if (sentence) sentences.push(sentence);
        current = [];
      }
    }
    const tail = current.join('').trim();
    if (tail) sentences.push(tail);
  }

  return sentences;
}

function sentenceWeight(sentence: string): number {
  const compact = sentence.replace(/\s+/g, '');
  if (!compact) return 1.0;

  let total = 0.0;
  for (const char of compact) {
    if (/[A-Za-z0-9]/.test(char)) {
      total += 0.55;
    } else if (/[一-鿿]/.test(char)) {
      total += 1.0;
    } else if ('，,、:：'.includes(char)) {
      total += 0.25;
    } else if ('。.!！?？；;'.includes(char)) {
      total += 0.45;
    } else {
      total += 0.65;
    }
  }
  return Math.max(total, 1.0);
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ml = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ml).padStart(3, '0')}`;
}

function readDurationSeconds(filePath: string): number | null {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wav') {
      const header = Buffer.alloc(44);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, header, 0, 44, 0);
      fs.closeSync(fd);
      const dataSize = header.readUInt32LE(40);
      const sampleRate = header.readUInt32LE(24);
      const channels = header.readUInt16LE(22);
      const bitsPerSample = header.readUInt16LE(34);
      const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
      if (bytesPerSec > 0) {
        return dataSize / bytesPerSec;
      }
    }
  } catch {
    // fallback to afinfo
  }

  // Try afinfo on macOS
  try {
    const output = execSync(`afinfo "${filePath}" 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const match = output.match(/estimated duration:\s*([0-9.]+)\s*sec/i) ||
                  output.match(/duration:\s*([0-9.]+)\s*sec/i);
    if (match) return parseFloat(match[1]);
  } catch {
    // ignore
  }

  return null;
}

function writeTimelineFiles(
  sourceText: string,
  audioPath: string,
  sentenceDurations: number[] | null,
): void {
  const sentences = splitSentences(sourceText);
  if (sentences.length === 0) {
    const stripped = sourceText.trim();
    if (stripped) sentences.push(stripped);
  }
  if (sentences.length === 0) return;

  const durationSeconds = readDurationSeconds(audioPath) || sentences.length * 2;

  const entries: TimelineEntry[] = [];
  let cursor = 0;

  if (sentenceDurations && sentenceDurations.length === sentences.length) {
    const totalDuration = sentenceDurations.reduce((a, b) => a + b, 0);
    const scale = totalDuration > 0 ? durationSeconds / totalDuration : 1;

    for (let i = 0; i < sentences.length; i++) {
      const end = i === sentences.length - 1
        ? durationSeconds
        : cursor + sentenceDurations[i] * scale;
      entries.push({
        index: i + 1,
        text: sentences[i],
        startSeconds: Math.round(cursor * 1000) / 1000,
        endSeconds: Math.round(Math.max(end, cursor) * 1000) / 1000,
        startMs: Math.round(cursor * 1000),
        endMs: Math.round(Math.max(end, cursor) * 1000),
      });
      cursor = Math.max(end, cursor);
    }
  } else {
    const weights = sentences.map(sentenceWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || sentences.length;

    for (let i = 0; i < sentences.length; i++) {
      const end = i === sentences.length - 1
        ? durationSeconds
        : cursor + (durationSeconds * weights[i] / totalWeight);
      entries.push({
        index: i + 1,
        text: sentences[i],
        startSeconds: Math.round(cursor * 1000) / 1000,
        endSeconds: Math.round(Math.max(end, cursor) * 1000) / 1000,
        startMs: Math.round(cursor * 1000),
        endMs: Math.round(Math.max(end, cursor) * 1000),
      });
      cursor = Math.max(end, cursor);
    }
  }

  // Ensure last entry ends at total duration
  if (entries.length > 0) {
    entries[entries.length - 1].endSeconds = Math.round(durationSeconds * 1000) / 1000;
    entries[entries.length - 1].endMs = Math.round(durationSeconds * 1000);
  }

  const timelineBase = audioPath.replace(/\.[^.]+$/, '');

  // Write JSON timeline
  const jsonPayload = {
    audio_file: path.basename(audioPath),
    audio_path: audioPath,
    audio_duration_seconds: Math.round(durationSeconds * 1000) / 1000,
    timing_mode: sentenceDurations ? 'sentence-audio' : 'estimated',
    generated_at: new Date().toISOString(),
    sentences: entries,
  };
  fs.writeFileSync(`${timelineBase}.timeline.json`, JSON.stringify(jsonPayload, null, 2) + '\n', 'utf-8');

  // Write SRT
  const srtLines: string[] = [];
  for (const entry of entries) {
    srtLines.push(String(entry.index));
    srtLines.push(`${srtTime(entry.startSeconds)} --> ${srtTime(entry.endSeconds)}`);
    srtLines.push(entry.text);
    srtLines.push('');
  }
  fs.writeFileSync(`${timelineBase}.srt`, srtLines.join('\n').trim() + '\n', 'utf-8');
}

function buildAutoProsodyText(rawText: string): string {
  return rawText
    .replace(/\n{2,}/g, ' [[slnc 260]] ')
    .replace(/\n/g, ' [[slnc 90]] ')
    .replace(/[，,、:：]/g, (m) => `${m} [[slnc 120]] `)
    .replace(/[。.]/g, (m) => `${m} [[slnc 180]] `)
    .replace(/[?？]/g, (m) => `${m} [[slnc 190]] `)
    .replace(/[!！]/g, (m) => `${m} [[slnc 150]] `)
    .replace(/[ \t]{2,}/g, ' ');
}

function applySpeechRateToAudio(outputPath: string, speechRate: number): void {
  if (Math.abs(speechRate - 1.0) < 1e-9) return;

  const tmpPath = `${outputPath}.rate_tmp${path.extname(outputPath)}`;
  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -y -i "${outputPath}" -filter:a "atempo=${speechRate}" "${tmpPath}"`,
      { stdio: 'ignore', timeout: 120000 },
    );
    if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
      fs.renameSync(tmpPath, outputPath);
    }
  } catch (err: unknown) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    throw new Error(
      `ffmpeg failed while applying --speech-rate: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

function splitTextForTts(text: string, maxChars: number | null): string[] {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  if (!maxChars || text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[。！？!?；;.!?])/)
      .map((s) => s.trim())
      .filter(Boolean);

    let current = '';
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        // split oversized sentence
        for (let i = 0; i < sentence.length; i += maxChars) {
          chunks.push(sentence.slice(i, i + maxChars));
        }
        continue;
      }

      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        chunks.push(current);
        current = sentence;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks;
}

function concatAudioFiles(partPaths: string[], outputPath: string): void {
  if (partPaths.length === 0) {
    throw new Error('No chunk audio generated for concatenation.');
  }
  if (partPaths.length === 1) {
    fs.copyFileSync(partPaths[0], outputPath);
    return;
  }

  // Use ffmpeg concat
  const listContent = partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  const listFile = path.join(fs.mkdtempSync('docs-to-voice-'), 'concat.txt');
  fs.mkdirSync(path.dirname(listFile), { recursive: true });
  fs.writeFileSync(listFile, listContent + '\n', 'utf-8');

  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "${listFile}" -c:a copy "${outputPath}"`,
      { stdio: 'ignore', timeout: 120000 },
    );
  } catch (err: unknown) {
    throw new Error(
      `ffmpeg concat failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  } finally {
    try { fs.unlinkSync(listFile); fs.rmdirSync(path.dirname(listFile)); } catch { /* ignore */ }
  }
}

function downloadBinary(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { timeout: 300000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve();
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

function requestAlibabaCloudTTS(
  endpoint: string,
  apiKey: string,
  model: string,
  voice: string,
  text: string,
): Promise<{ audioUrl?: string; audioData?: string; audioFormat?: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model,
      input: { text, voice },
    });

    const urlObj = new URL(endpoint);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000,
    };

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const rawPayload = Buffer.concat(chunks).toString('utf-8');
        try {
          const responseJson = JSON.parse(rawPayload);
          const output = responseJson.output || {};
          const audio = output.audio || {};
          const audioUrl = audio.url || '';
          const audioData = audio.data || '';
          const audioFormat = audio.format || audio.mime_type || '';

          if (!audioUrl && !audioData) {
            reject(new Error('API response does not contain output.audio.url or output.audio.data'));
            return;
          }

          resolve({ audioUrl, audioData, audioFormat });
        } catch {
          reject(new Error('API response is not valid JSON.'));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timed out')); });
    req.write(payload);
    req.end();
  });
}

const schema = {
  options: {
    'text': { type: 'string' as const },
    'input': { type: 'string' as const },
    'input-file': { type: 'string' as const },
    'project-dir': { type: 'string' as const, default: '.' },
    'project-name': { type: 'string' as const },
    'output-name': { type: 'string' as const },
    'engine': { type: 'string' as const },
    'mode': { type: 'string' as const, default: 'say' },
    'voice': { type: 'string' as const },
    'rate': { type: 'string' as const },
    'speech-rate': { type: 'string' as const },
    'api-endpoint': { type: 'string' as const, default: DEFAULT_API_ENDPOINT },
    'api-model': { type: 'string' as const, default: DEFAULT_API_MODEL },
    'api-voice': { type: 'string' as const, default: DEFAULT_API_VOICE },
    'api-key': { type: 'string' as const },
    'max-chars': { type: 'string' as const },
    'no-auto-prosody': { type: 'boolean' as const, default: false },
    'force': { type: 'boolean' as const, default: false },
  },
  allowPositionals: true,
  usage: 'apltk docs-to-voice [options]',
  description: 'Convert text into audio and sentence timelines.',
  handler: async (
    values: Record<string, unknown>,
    _positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout ?? process.stdout;
    const stderr = context.stderr ?? process.stderr;

    try {
      // Resolve args (previously handled by parseCliArgs)
      const inputText: string | null = (values['text'] as string | undefined) ?? null;
      const inputFile: string | null = (values['input'] as string | undefined) || (values['input-file'] as string | undefined) || null;
      const projectDir: string = (values['project-dir'] as string) || '.';
      const projectName: string | null = (values['project-name'] as string | undefined) ?? null;
      const outputName: string | null = (values['output-name'] as string | undefined) ?? null;
      const mode: string = ((values['mode'] as string | undefined) || (values['engine'] as string | undefined) || 'say').toLowerCase();
      const voice: string | null = (values['voice'] as string | undefined) ?? null;
      const rate: string | null = (values['rate'] as string | undefined) ?? null;
      const speechRate: string | null = (values['speech-rate'] as string | undefined) ?? null;
      const apiEndpoint: string = (values['api-endpoint'] as string) || DEFAULT_API_ENDPOINT;
      const apiModel: string = (values['api-model'] as string) || DEFAULT_API_MODEL;
      const apiVoice: string = (values['api-voice'] as string) || DEFAULT_API_VOICE;
      const apiKey: string | null = (values['api-key'] as string | undefined) ?? null;
      const maxChars: string | null = (values['max-chars'] as string | undefined) ?? null;
      const noAutoProsody: boolean = !!values['no-auto-prosody'];
      const force: boolean = !!values['force'];

      if (mode !== 'say' && mode !== 'api') {
        throw new UserInputError('--mode must be one of: say, api');
      }

      const sourceText = readInputText(inputFile, inputText);
      if (!sourceText.trim()) {
        throw new UserInputError('No text content found for conversion.');
      }

      // Resolve output directory
      const resolvedProjectDir = path.resolve(projectDir);
      const resolvedProjectName = projectName || path.basename(resolvedProjectDir);
      if (!resolvedProjectName) {
        throw new UserInputError('Unable to determine project name.');
      }

      const outputDir = path.join(resolvedProjectDir, 'audio', resolvedProjectName);
      fs.mkdirSync(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outName = outputName || `voice-${timestamp}`;
      const hasExtension = outName.includes('.');

      if (mode === 'say') {
        // macOS say mode
        const textChunks = splitTextForTts(sourceText, maxChars ? parseInt(maxChars, 10) || null : null);
        if (textChunks.length === 0) {
          throw new UserInputError('No text content found for conversion.');
        }

        // Check if `say` is available
        try {
          execSync('which say', { stdio: 'ignore' });
        } catch {
          throw new UserInputError("macOS 'say' command not found.");
        }

        const finalOutputName = hasExtension ? outName : `${outName}.aiff`;
        const outputPath = path.join(outputDir, finalOutputName);

        if (fs.existsSync(outputPath) && !force) {
          throw new UserInputError(`Output already exists: ${outputPath}. Use --force to overwrite.`);
        }

        // Build prosody-enhanced text
        const chunks = noAutoProsody ? textChunks : textChunks.map(buildAutoProsodyText);

        if (chunks.length === 1) {
          // Single say command
          const sayArgs = ['-o', outputPath];
          if (voice) sayArgs.push('-v', voice);
          if (rate) sayArgs.push('-r', rate);

          const tmpFile = path.join(fs.mkdtempSync('docs-to-voice-'), 'input.txt');
          fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
          fs.writeFileSync(tmpFile, chunks[0], 'utf-8');
          sayArgs.push('-f', tmpFile);

          try {
            execSync(`say ${sayArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
              stdio: 'ignore',
              timeout: 300000,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'unknown error';
            throw new Error(`say mode failed: ${msg}`);
          } finally {
            try { fs.unlinkSync(tmpFile); fs.rmdirSync(path.dirname(tmpFile)); } catch { /* ignore */ }
          }
        } else {
          // Multiple chunks: generate then concat
          const tempDir = fs.mkdtempSync('docs-to-voice-say-');
          const partPaths: string[] = [];
          const partExt = path.extname(outputPath) || '.aiff';

          try {
            for (let i = 0; i < chunks.length; i++) {
              const partPath = path.join(tempDir, `part-${String(i + 1).padStart(4, '0')}${partExt}`);
              const sArgs = ['-o', partPath];
              if (voice) sArgs.push('-v', voice);
              if (rate) sArgs.push('-r', rate);

              const tFile = path.join(tempDir, `chunk-${i}.txt`);
              fs.writeFileSync(tFile, chunks[i], 'utf-8');
              sArgs.push('-f', tFile);

              execSync(
                `say ${sArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
                { stdio: 'ignore', timeout: 300000 },
              );
              partPaths.push(partPath);
            }

            concatAudioFiles(partPaths, outputPath);
          } finally {
            try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
          }
        }

        // Apply speech rate if requested
        if (speechRate) {
          const rateVal = parseFloat(speechRate);
          if (rateVal > 0) applySpeechRateToAudio(outputPath, rateVal);
        }

        // Write timeline files
        writeTimelineFiles(sourceText, outputPath, null);
        stdout.write(`${outputPath}\n`);
      } else {
        // API mode
        if (!apiKey) {
          throw new UserInputError('--api-key is required for api mode.');
        }

        const sentences = splitSentences(sourceText);
        if (sentences.length === 0) {
          throw new UserInputError('No text content found for conversion.');
        }

        const maxCharsNum = maxChars ? parseInt(maxChars, 10) || null : null;

        // Build request items from sentences
        interface RequestItem {
          sentenceIndex: number;
          text: string;
        }
        const requestItems: RequestItem[] = [];
        for (let si = 0; si < sentences.length; si++) {
          const sentence = sentences[si];
          if (maxCharsNum && sentence.length > maxCharsNum) {
            for (let i = 0; i < sentence.length; i += maxCharsNum) {
              requestItems.push({ sentenceIndex: si, text: sentence.slice(i, i + maxCharsNum) });
            }
          } else {
            requestItems.push({ sentenceIndex: si, text: sentence });
          }
        }

        if (requestItems.length === 0) {
          throw new UserInputError('No text content found for conversion.');
        }

        const tempDir = fs.mkdtempSync('docs-to-voice-api-');
        const partPaths: string[] = [];
        let partExt = '';
        const sentenceDurations = new Array(sentences.length).fill(0);
        const sentenceDurationKnown = new Array(sentences.length).fill(true);

        try {
          for (let i = 0; i < requestItems.length; i++) {
            const item = requestItems[i];
            const apiResult = await requestAlibabaCloudTTS(
              apiEndpoint,
              apiKey,
              apiModel,
              apiVoice,
              item.text,
            );

            const currentExt = apiResult.audioFormat || 'wav';
            if (!partExt) partExt = currentExt;

            const partPath = path.join(tempDir, `part-${String(i + 1).padStart(4, '0')}.${currentExt}`);
            if (apiResult.audioUrl) {
              await downloadBinary(apiResult.audioUrl, partPath);
            } else if (apiResult.audioData) {
              fs.writeFileSync(partPath, Buffer.from(apiResult.audioData, 'base64'));
            } else {
              throw new Error('No audio data in API response.');
            }

            if (!fs.existsSync(partPath) || fs.statSync(partPath).size === 0) {
              throw new Error(`Failed to generate audio chunk ${i + 1}.`);
            }
            partPaths.push(partPath);

            const partDuration = readDurationSeconds(partPath);
            if (partDuration === null || partDuration <= 0) {
              sentenceDurationKnown[item.sentenceIndex] = false;
            } else {
              sentenceDurations[item.sentenceIndex] += partDuration;
            }
          }

          const finalOutputName = hasExtension
            ? outName
            : `${outName}.${partExt || 'wav'}`;
          const outputPath = path.join(outputDir, finalOutputName);

          if (fs.existsSync(outputPath) && !force) {
            throw new UserInputError(`Output already exists: ${outputPath}. Use --force to overwrite.`);
          }

          concatAudioFiles(partPaths, outputPath);

          // Build timeline durations
          let timelineDurations: number[] | null = null;
          const unknownIndexes = sentenceDurationKnown
            .map((known, idx) => (known ? -1 : idx))
            .filter((idx) => idx >= 0);

          if (unknownIndexes.length === 0 && sentenceDurations.reduce((a, b) => a + b, 0) > 0) {
            timelineDurations = sentenceDurations;
          } else if (unknownIndexes.length > 0) {
            const outputDuration = readDurationSeconds(outputPath);
            const knownTotal = sentenceDurations.reduce(
              (sum, val, idx) => (sentenceDurationKnown[idx] ? sum + val : sum),
              0,
            );

            if (outputDuration && outputDuration > knownTotal) {
              const remaining = outputDuration - knownTotal;
              const unknownWeights = unknownIndexes.map((idx) => sentenceWeight(sentences[idx]));
              const totalUnknownWeight = unknownWeights.reduce((a, b) => a + b, 0);

              if (totalUnknownWeight > 0) {
                for (let wi = 0; wi < unknownIndexes.length; wi++) {
                  sentenceDurations[unknownIndexes[wi]] +=
                    remaining * (unknownWeights[wi] / totalUnknownWeight);
                }
                timelineDurations = sentenceDurations;
              }
            }
          }

          // Apply speech rate if requested
          if (speechRate) {
            const rateVal = parseFloat(speechRate);
            if (rateVal > 0) {
              applySpeechRateToAudio(outputPath, rateVal);
              if (timelineDurations) {
                timelineDurations = timelineDurations.map((d) => d / rateVal);
              }
            }
          }

          writeTimelineFiles(sourceText, outputPath, timelineDurations);
          stdout.write(`${outputPath}\n`);
        } finally {
          try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
        }
      }

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
  },
};

export const tool: ToolDefinition = {
  name: 'docs-to-voice',
  category: 'media',
  description: 'Convert text into audio and sentence timelines.',
  handler: createToolRunner(schema),
};
