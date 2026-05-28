import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

interface AspectArgs {
  inputVideo: string | null;
  outputVideo: string | null;
  inPlace: boolean;
  targetSize: string | null;
  targetWidth: number | null;
  targetHeight: number | null;
  aspect: string | null;
  force: boolean;
  ffmpegBin: string;
  ffprobeBin: string;
  help: boolean;
}

function parseArgs(args: string[]): AspectArgs {
  const parsed: AspectArgs = {
    inputVideo: null,
    outputVideo: null,
    inPlace: false,
    targetSize: null,
    targetWidth: null,
    targetHeight: null,
    aspect: null,
    force: false,
    ffmpegBin: 'ffmpeg',
    ffprobeBin: 'ffprobe',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let key: string;
      let value: string;

      if (eqIndex !== -1) {
        key = arg.slice(2, eqIndex);
        value = arg.slice(eqIndex + 1);
      } else {
        key = arg.slice(2);
        value = args[++i] || '';
      }

      switch (key) {
        case 'input':
        case 'input-video':
          parsed.inputVideo = value;
          break;
        case 'output':
        case 'output-video':
          parsed.outputVideo = value;
          break;
        case 'in-place':
          parsed.inPlace = true;
          break;
        case 'aspect':
          parsed.aspect = value;
          break;
        case 'target-size':
          parsed.targetSize = value;
          break;
        case 'target-width':
          parsed.targetWidth = parseInt(value, 10) || null;
          break;
        case 'target-height':
          parsed.targetHeight = parseInt(value, 10) || null;
          break;
        case 'force':
          parsed.force = true;
          break;
        case 'ffmpeg-bin':
          parsed.ffmpegBin = value;
          break;
        case 'ffprobe-bin':
          parsed.ffprobeBin = value;
          break;
      }
    } else if (!parsed.inputVideo && !arg.startsWith('-')) {
      parsed.inputVideo = arg;
    }
  }

  return parsed;
}

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

function resolveTargetSize(opts: AspectArgs): { width: number; height: number } {
  if (opts.aspect) {
    // Aspect ratio mode: derive target size from input
    // We'll resolve this later in the handler
    return { width: 0, height: 0 };
  }

  if (opts.targetSize && (opts.targetWidth !== null || opts.targetHeight !== null)) {
    throw new Error('Use either --target-size or --target-width/--target-height, not both.');
  }

  if (opts.targetSize) return parseSize(opts.targetSize);

  const width = opts.targetWidth || parseInt(process.env.TEXT_TO_SHORT_VIDEO_WIDTH || '1080', 10);
  const height = opts.targetHeight || parseInt(process.env.TEXT_TO_SHORT_VIDEO_HEIGHT || '1920', 10);

  if (width <= 0 || height <= 0) throw new Error('Target width and height must be positive integers.');
  return { width, height };
}

export async function enforceVideoAspectRatioHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  try {
    const opts = parseArgs(args);

    if (opts.help) {
      stdout.write(`Usage: apltk enforce-video-aspect-ratio [options]

Resize video output to a target aspect ratio or size.

Options:
  --input, --input-video <path>   Path to input video (required)
  --output, --output-video <path> Path to output video
  --in-place                      Overwrite input file
  --aspect <ratio>                Target aspect ratio, e.g. 9:16 or 16:9
  --target-size <size>            Target size, e.g. 1080x1920
  --target-width <px>             Target width
  --target-height <px>            Target height
  --force                         Overwrite existing output
  --ffmpeg-bin <path>             ffmpeg executable (default: ffmpeg)
  --ffprobe-bin <path>            ffprobe executable (default: ffprobe)
`);
      return 0;
    }

    if (!opts.inputVideo) {
      stderr.write('Error: --input-video is required.\n');
      return 1;
    }

    const inputPath = path.resolve(opts.inputVideo);
    if (!fs.existsSync(inputPath)) {
      stderr.write(`Error: Input video not found: ${inputPath}\n`);
      return 1;
    }

    if (opts.inPlace && opts.outputVideo) {
      stderr.write('Error: Do not pass --output-video with --in-place.\n');
      return 1;
    }

    // Validate ffmpeg/ffprobe availability
    try {
      execSync(`which ${opts.ffmpegBin}`, { stdio: 'ignore' });
      execSync(`which ${opts.ffprobeBin}`, { stdio: 'ignore' });
    } catch {
      stderr.write(`Error: Missing required commands: ${opts.ffmpegBin}, ${opts.ffprobeBin}\n`);
      return 1;
    }

    const inputSize = probeVideoSize(inputPath, opts.ffprobeBin);

    // Resolve target dimensions
    let targetWidth: number;
    let targetHeight: number;

    if (opts.aspect) {
      // Derive from aspect ratio based on input dimensions
      const ratio = parseRatio(opts.aspect);
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
      const target = resolveTargetSize(opts);
      targetWidth = target.width;
      targetHeight = target.height;
    }

    // Resolve output path
    let outputPath: string;
    let replaceInPlace = false;

    if (opts.inPlace) {
      outputPath = path.join(
        path.dirname(inputPath),
        `.tmp_${path.basename(inputPath)}`,
      );
      replaceInPlace = true;
    } else if (opts.outputVideo) {
      outputPath = path.resolve(opts.outputVideo);
      if (outputPath === inputPath) {
        stderr.write('Error: Output path equals input path. Use --in-place to replace the input file.\n');
        return 1;
      }
    } else {
      const parsed = path.parse(inputPath);
      outputPath = path.join(parsed.dir, `${parsed.name}_aspect_fixed.mp4`);
    }

    if (!replaceInPlace && fs.existsSync(outputPath) && !opts.force) {
      stderr.write(`Error: Output already exists: ${outputPath}. Use --force to overwrite.\n`);
      return 1;
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
      opts.ffmpegBin,
      '-hide_banner',
      '-loglevel', 'error',
      opts.force || replaceInPlace ? '-y' : '-n',
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
      throw new Error(`ffmpeg failed: ${msg}`);
    }

    if (replaceInPlace) {
      fs.renameSync(outputPath, inputPath);
      outputPath = inputPath;
    }

    const finalSize = probeVideoSize(outputPath, opts.ffprobeBin);
    stdout.write(
      `[OK] Processed video written: ${outputPath}\n` +
      `[INFO] Input size: ${inputSize.width}x${inputSize.height}\n` +
      `[INFO] Target size: ${targetWidth}x${targetHeight}\n` +
      `[INFO] Output size: ${finalSize.width}x${finalSize.height}\n` +
      `[INFO] Center crop applied: ${cropApplied ? 'yes' : 'no'}\n`,
    );

    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    stderr.write(`Error: ${msg}\n`);
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'enforce-video-aspect-ratio',
  category: 'media',
  description: 'Resize video output to a target aspect ratio or size.',
  handler: enforceVideoAspectRatioHandler,
};
