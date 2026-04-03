import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  AudioMetadataRequest,
  AudioProcessorProvider,
  AudioTranscodeRequest,
  AudioTranscodeResult,
  AudioWaveformRequest,
  AudioWaveformResult,
} from '../types.js';
import { resolveBinaryPath, runBinary, runBinaryCapture, withTempDir } from './command-utils.js';

const AUDIO_CODEC_ARGS: Record<string, string[]> = {
  mp3: ['-c:a', 'libmp3lame'],
  aac: ['-c:a', 'aac'],
  opus: ['-c:a', 'libopus'],
  vorbis: ['-c:a', 'libvorbis'],
  flac: ['-c:a', 'flac'],
};

const AUDIO_OUTPUTS: Record<string, { extension: string; mimeType: string }> = {
  mp3: { extension: 'mp3', mimeType: 'audio/mpeg' },
  aac: { extension: 'm4a', mimeType: 'audio/mp4' },
  opus: { extension: 'opus', mimeType: 'audio/opus' },
  vorbis: { extension: 'ogg', mimeType: 'audio/ogg' },
  flac: { extension: 'flac', mimeType: 'audio/flac' },
};

export interface CommandAudioProviderConfig {
  ffmpegPath?: string;
  ffprobePath?: string;
}

function outputExtensionForInput(mimeType: string): string {
  switch (mimeType) {
    case 'audio/flac':
      return 'flac';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/opus':
      return 'opus';
    case 'audio/wav':
      return 'wav';
    case 'audio/mp4':
    case 'audio/aac':
    case 'audio/x-m4a':
      return 'm4a';
    default:
      return 'mp3';
  }
}

function validateBitrate(bitrate: string): string {
  const normalized = bitrate.trim();
  if (!/^\d+(?:\.\d+)?(?:[kKmM])?$/.test(normalized)) {
    throw new Error(`Invalid bitrate: ${bitrate}`);
  }
  return normalized;
}

function readStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function buildWaveformFromPcm(
  pcm: Buffer,
  sampleRate: number,
  sampleCount = 100,
): AudioWaveformResult {
  if (pcm.length < 2 || sampleRate <= 0 || sampleCount <= 0) {
    return {
      samples: [],
      peakAmplitude: 0,
      duration: 0,
    };
  }

  const totalFrames = Math.floor(pcm.length / 2);
  if (totalFrames === 0) {
    return {
      samples: [],
      peakAmplitude: 0,
      duration: 0,
    };
  }

  const samples: number[] = [];
  const windowSize = Math.max(1, Math.floor(totalFrames / sampleCount));
  let peakAmplitude = 0;

  for (let offset = 0; offset < totalFrames; offset += windowSize) {
    const end = Math.min(totalFrames, offset + windowSize);
    let peak = 0;
    for (let index = offset; index < end; index += 1) {
      const amplitude = Math.abs(pcm.readInt16LE(index * 2) / 32768);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
    const rounded = Number(peak.toFixed(4));
    samples.push(rounded);
    if (rounded > peakAmplitude) {
      peakAmplitude = rounded;
    }
  }

  return {
    samples,
    peakAmplitude,
    duration: Number((totalFrames / sampleRate).toFixed(4)),
  };
}

export function createCommandAudioProvider(config: CommandAudioProviderConfig = {}): AudioProcessorProvider {
  const ffmpegPath = resolveBinaryPath(config.ffmpegPath, ['FILEFN_FFMPEG_PATH', 'FFMPEG_PATH'], 'ffmpeg');
  const ffprobePath = resolveBinaryPath(config.ffprobePath, ['FILEFN_FFPROBE_PATH', 'FFPROBE_PATH'], 'ffprobe');

  async function extractMetadata(request: AudioMetadataRequest): Promise<Record<string, unknown>> {
    return await withTempDir('filefn-processing-audio-', async (dir) => {
      const inputPath = join(dir, `input.${outputExtensionForInput(request.input.mimeType)}`);
      await writeFile(inputPath, Buffer.from(request.audioData));

      const stdout = await runBinaryCapture(ffprobePath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        inputPath,
      ]);
      const parsed = JSON.parse(stdout) as {
        streams?: Array<Record<string, unknown>>;
        format?: Record<string, unknown>;
      };
      const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio') ?? {};
      const format = parsed.format ?? {};
      const tags =
        format.tags && typeof format.tags === 'object'
          ? (format.tags as Record<string, unknown>)
          : {};

      return {
        duration: Number(format.duration ?? audioStream.duration ?? 0),
        codec: readStringValue(audioStream.codec_name),
        bitrate: readStringValue(format.bit_rate) ?? readStringValue(audioStream.bit_rate),
        sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
        channels: audioStream.channels ? Number(audioStream.channels) : null,
        fileSize: request.audioData.length,
        format: readStringValue(format.format_name),
        title: readStringValue(tags.title),
        artist: readStringValue(tags.artist),
        album: readStringValue(tags.album),
        year: readStringValue(tags.date) ?? readStringValue(tags.year),
        genre: readStringValue(tags.genre),
        creationTime: readStringValue(tags.creation_time),
      };
    });
  }

  async function transcode(request: AudioTranscodeRequest): Promise<AudioTranscodeResult> {
    return await withTempDir('filefn-processing-audio-', async (dir) => {
      const inputPath = join(dir, `input.${outputExtensionForInput(request.input.mimeType)}`);
      const outputInfo = AUDIO_OUTPUTS[request.codec] ?? AUDIO_OUTPUTS.aac;
      const outputPath = join(dir, `output.${outputInfo.extension}`);

      await writeFile(inputPath, Buffer.from(request.audioData));

      const args = [
        '-y',
        '-i',
        inputPath,
        ...(AUDIO_CODEC_ARGS[request.codec] ?? AUDIO_CODEC_ARGS.aac),
        '-b:a',
        validateBitrate(request.bitrate),
        '-ar',
        String(request.sampleRate),
        '-ac',
        String(request.channels),
        outputPath,
      ];

      await runBinary(ffmpegPath, args);

      return {
        data: new Uint8Array(await readFile(outputPath)),
        mimeType: outputInfo.mimeType,
        extension: outputInfo.extension,
      };
    });
  }

  async function generateWaveform(request: AudioWaveformRequest): Promise<AudioWaveformResult> {
    return await withTempDir('filefn-processing-audio-', async (dir) => {
      const inputPath = join(dir, `input.${outputExtensionForInput(request.input.mimeType)}`);
      const pcmPath = join(dir, 'waveform.pcm');

      await writeFile(inputPath, Buffer.from(request.audioData));

      await runBinary(ffmpegPath, [
        '-y',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        's16le',
        pcmPath,
      ]);

      const pcm = await readFile(pcmPath);
      return buildWaveformFromPcm(pcm, 16000, request.samples ?? 100);
    });
  }

  return {
    transcode,
    extractMetadata,
    generateWaveform,
  };
}
