import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, SystemError, createToolRunner } from '@laitszkin/tool-utils';

function parseSize(value: string): { width: number; height: number } {
  const match = value.trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) throw new Error('Invalid size format. Use WIDTHxHEIGHT, for example 1080x1920.');
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive integers.');
  return { width, height };
}

function parseRatio(value: string): { width: number; height: number } {
  const match = value.trim().match(/^(\d+):(\d+)$/);
  if (!match) throw new Error('Invalid aspect ratio format. Use WIDTH:HEIGHT, for example 16:9.');
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (width <= 0 || height <= 0) throw new Error('Aspect ratio values must be positive integers.');
  return { width, height };
}

function probeVideoSize(videoPath: string, ffprobeBin: string): { width: number; height: number } {
  const result = execSync(
    `${ffprobeBin} -v error -select_streams v:0 -show_entries stream=width,height -of json "${videoPath}"`,
    { encoding: 'utf-8', timeout: 30000 },
  );

  const payload = JSON.parse(result);
  const streams = payload.streams;
  if (!Array.isArray(streams) || streams.length === 0) {
    throw new Error(`No video stream found in ${videoPath}.`);
  }

  const first = streams[0];
  const width = first.width;
  const height = first.height;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    throw new Error(`Invalid video dimensions from ffprobe for ${videoPath}.`);
  }
  return { width, height };
}

function evenFloor(value: number, minimum = 2): number {
  const floored = value % 2 === 0 ? value : value - 1;
  return Math.max(floored, minimum);
}

function buildVideoFilter(
  inputWidth: number,
  inputHeight: number,
  targetWidth: number,
  targetHeight: number,
): { filter: string | null; cropApplied: boolean } {
  const sameRatio = inputWidth * targetHeight === inputHeight * targetWidth;
  const sameSize = inputWidth === targetWidth && inputHeight === targetHeight;

  if (sameRatio && sameSize) return { filter: null, cropApplied: false };
  if (sameRatio) return { filter: `scale=${targetWidth}:${targetHeight}`, cropApplied: false };

  const inputWider = inputWidth * targetHeight > inputHeight * targetWidth;

  let cropWidth: number;
  let cropHeight: number;

  if (inputWider) {
    cropWidth = Math.floor(inputHeight * targetWidth / targetHeight);
    cropHeight = inputHeight;
  } else {
    cropWidth = inputWidth;
    cropHeight = Math.floor(inputWidth * targetHeight / targetWidth);
  }

  cropWidth = Math.min(evenFloor(cropWidth), evenFloor(inputWidth));
  cropHeight = Math.min(evenFloor(cropHeight), evenFloor(inputHeight));

  const offsetX = Math.max(Math.floor((inputWidth - cropWidth) / 2), 0);
  const offsetY = Math.max(Math.floor((inputHeight - cropHeight) / 2), 0);

  return {
    filter: `crop=${cropWidth}:${cropHeight}:${offsetX}:${offsetY},scale=${targetWidth}:${targetHeight}`,
    cropApplied: true,
  };
}

function resolveTargetSize(
  targetSize: string | null,
  targetWidth: number | null,
  targetHeight: number | null,
): { width: number; height: number } {
  if (targetSize && (targetWidth !== null || targetHeight !== null)) {
    throw new Error('Use either --target-size or --target-width/--target-height, not both.');
  }

  if (targetSize) return parseSize(targetSize);

  const width = targetWidth || parseInt(process.env.TEXT_TO_SHORT_VIDEO_WIDTH || '1080', 10);
  const height = targetHeight || parseInt(process.env.TEXT_TO_SHORT_VIDEO_HEIGHT || '1920', 10);

  if (width <= 0 || height <= 0) throw new Error('Target width and height must be positive integers.');
  return { width, height };
}

const schema = {
  options: {
    'input': { type: 'string' as const },
    'input-video': { type: 'string' as const },
    'output': { type: 'string' as const },
    'output-video': { type: 'string' as const },
    'in-place': { type: 'boolean' as const, default: false },
    'aspect': { type: 'string' as const },
    'target-size': { type: 'string' as const },
    'target-width': { type: 'string' as const },
    'target-height': { type: 'string' as const },
    'force': { type: 'boolean' as const, default: false },
    'ffmpeg-bin': { type: 'string' as const, default: 'ffmpeg' },
    'ffprobe-bin': { type: 'string' as const, default: 'ffprobe' },
  },
  allowPositionals: true,
  usage: 'apltk enforce-video-aspect-ratio [options]',
  description: 'Resize video output to a target aspect ratio or size.',
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout || process.stdout;

    const inputVideo = (values['input'] as string | undefined) ||
      (values['input-video'] as string | undefined) ||
      positionals[0] ||
      null;

    const outputVideo = (values['output'] as string | undefined) ||
      (values['output-video'] as string | undefined) ||
      null;

    const inPlace = !!values['in-place'];
    const targetSize = (values['target-size'] as string | undefined) ?? null;
    const targetWidthVal = values['target-width'] ? parseInt(values['target-width'] as string, 10) || null : null;
    const targetHeightVal = values['target-height'] ? parseInt(values['target-height'] as string, 10) || null : null;
    const aspect = (values['aspect'] as string | undefined) ?? null;
    const force = !!values['force'];
    const ffmpegBin = (values['ffmpeg-bin'] as string) || 'ffmpeg';
    const ffprobeBin = (values['ffprobe-bin'] as string) || 'ffprobe';

    if (!inputVideo) {
      throw new UserInputError('--input-video is required.');
    }

    const inputPath = path.resolve(inputVideo);
    if (!fs.existsSync(inputPath)) {
      throw new UserInputError(`Input video not found: ${inputPath}`);
    }

    if (inPlace && outputVideo) {
      throw new UserInputError('Do not pass --output-video with --in-place.');
    }

    // Validate ffmpeg/ffprobe availability
    try {
      execSync(`which ${ffmpegBin}`, { stdio: 'ignore' });
      execSync(`which ${ffprobeBin}`, { stdio: 'ignore' });
    } catch {
      throw new UserInputError(`Missing required commands: ${ffmpegBin}, ${ffprobeBin}`);
    }

    const inputSize = probeVideoSize(inputPath, ffprobeBin);

    // Resolve target dimensions
    let targetWidth: number;
    let targetHeight: number;

    if (aspect) {
      // Derive from aspect ratio based on input dimensions
      const ratio = parseRatio(aspect);
      const inputWider = inputSize.width * ratio.height > inputSize.height * ratio.width;

      if (inputWider) {
        targetWidth = Math.floor(inputSize.height * ratio.width / ratio.height);
        targetHeight = inputSize.height;
      } else {
        targetWidth = inputSize.width;
        targetHeight = Math.floor(inputSize.width * ratio.height / ratio.width);
      }
      // Ensure even dimensions
      targetWidth = evenFloor(targetWidth);
      targetHeight = evenFloor(targetHeight);
    } else {
      const target = resolveTargetSize(targetSize, targetWidthVal, targetHeightVal);
      targetWidth = target.width;
      targetHeight = target.height;
    }

    // Resolve output path
    let outputPath: string;
    let replaceInPlace = false;

    if (inPlace) {
      outputPath = path.join(
        path.dirname(inputPath),
        `.tmp_${path.basename(inputPath)}`,
      );
      replaceInPlace = true;
    } else if (outputVideo) {
      outputPath = path.resolve(outputVideo);
      if (outputPath === inputPath) {
        throw new UserInputError('Output path equals input path. Use --in-place to replace the input file.');
      }
    } else {
      const parsed = path.parse(inputPath);
      outputPath = path.join(parsed.dir, `${parsed.name}_aspect_fixed.mp4`);
    }

    if (!replaceInPlace && fs.existsSync(outputPath) && !force) {
      throw new UserInputError(`Output already exists: ${outputPath}. Use --force to overwrite.`);
    }

    const { filter, cropApplied } = buildVideoFilter(
      inputSize.width,
      inputSize.height,
      targetWidth,
      targetHeight,
    );

    if (filter === null) {
      stdout.write(
        `[INFO] Video already matches target size and aspect ratio: ${inputSize.width}x${inputSize.height}.\n`,
      );
      if (!replaceInPlace && outputPath !== inputPath) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.copyFileSync(inputPath, outputPath);
        stdout.write(`[OK] Copied original video to: ${outputPath}\n`);
      }
      return 0;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const ffmpegCmd = [
      ffmpegBin,
      '-hide_banner',
      '-loglevel', 'error',
      force || replaceInPlace ? '-y' : '-n',
      '-i', inputPath,
      '-vf', filter,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath,
    ];

    try {
      execSync(ffmpegCmd.join(' '), { stdio: 'ignore', timeout: 300000 });
    } catch (err: unknown) {
      if (replaceInPlace && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      const msg = err instanceof Error ? err.message : 'unknown error';
      throw new SystemError(`ffmpeg failed: ${msg}`);
    }

    if (replaceInPlace) {
      fs.renameSync(outputPath, inputPath);
      outputPath = inputPath;
    }

    const finalSize = probeVideoSize(outputPath, ffprobeBin);
    stdout.write(
      `[OK] Processed video written: ${outputPath}\n` +
      `[INFO] Input size: ${inputSize.width}x${inputSize.height}\n` +
      `[INFO] Target size: ${targetWidth}x${targetHeight}\n` +
      `[INFO] Output size: ${finalSize.width}x${finalSize.height}\n` +
      `[INFO] Center crop applied: ${cropApplied ? 'yes' : 'no'}\n`,
    );

    return 0;
  },
};

export const tool: ToolDefinition = {
  name: 'enforce-video-aspect-ratio',
  category: 'media',
  description: 'Resize video output to a target aspect ratio or size.',
  handler: createToolRunner(schema),
};
