export type OutputMode = "text" | "json";
export type OutputLevel = "debug" | "info" | "success" | "warn" | "error";

export interface OutputMessage {
  level: OutputLevel;
  message: string;
  details?: unknown;
}

export interface OutputTable {
  columns: readonly string[];
  rows: ReadonlyArray<Record<string, string | number | boolean | null | undefined>>;
}

export interface OutputOptions {
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  mode?: OutputMode;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export interface Spinner {
  start(): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}

export interface OutputService {
  readonly mode: OutputMode;
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  success(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
  json(value: unknown): void;
  table(input: OutputTable): void;
  spinner(message: string): Spinner;
}

const COLOR = {
  blue: "\u001b[34m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  reset: "\u001b[0m",
} as const;

const LEVEL_PREFIX: Record<OutputLevel, string> = {
  debug: "[d]",
  info: "[i]",
  success: "[ok]",
  warn: "[!]",
  error: "[x]",
};

const LEVEL_COLOR: Record<OutputLevel, keyof typeof COLOR | null> = {
  debug: null,
  info: "blue",
  success: "green",
  warn: "yellow",
  error: "red",
};

function normalizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    try {
      return value.map((item) => normalizeJsonValue(item, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    try {
      if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
        return normalizeJsonValue((value as { toJSON: () => unknown }).toJSON(), seen);
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
          key,
          normalizeJsonValue(nested, seen),
        ])
      );
    } finally {
      seen.delete(value);
    }
  }

  return value;
}

function serializeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(normalizeJsonValue(value));
    return serialized ?? "null";
  } catch {
    return JSON.stringify({
      error: "Unable to serialize value",
    });
  }
}

function stringifyJson(value: unknown): string {
  return `${serializeJson(value)}\n`;
}

function colorize(enabled: boolean, level: OutputLevel, message: string): string {
  const color = LEVEL_COLOR[level];
  if (!enabled || color === null) {
    return message;
  }
  return `${COLOR[color]}${message}${COLOR.reset}`;
}

function formatTextMessage(enabledColor: boolean, level: OutputLevel, message: string, details?: unknown): string {
  const suffix = details === undefined ? "" : ` ${serializeJson(details)}`;
  return `${colorize(enabledColor, level, `${LEVEL_PREFIX[level]} ${message}`)}${suffix}\n`;
}

function shouldSkip(level: OutputLevel, options: Required<Pick<OutputOptions, "quiet" | "verbose">>): boolean {
  if (options.quiet && level !== "error") {
    return true;
  }

  if (level === "debug" && !options.verbose) {
    return true;
  }

  return false;
}

function createNoopSpinner(): Spinner {
  return {
    start() {},
    stop() {},
    succeed() {},
    fail() {},
  };
}

function createSpinner(
  message: string,
  writer: (text: string) => void,
  enabledColor: boolean
): Spinner {
  const frames = ["-", "\\", "|", "/"];
  let timer: NodeJS.Timeout | null = null;
  let frameIndex = 0;
  let current = message;

  const render = () => {
    writer(`\r${frames[frameIndex % frames.length]} ${current}`);
    frameIndex += 1;
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    writer("\r");
    writer(" ".repeat(Math.max(current.length + 2, 3)));
    writer("\r");
  };

  return {
    start() {
      if (timer) {
        return;
      }
      render();
      timer = setInterval(render, 80);
    },
    stop,
    succeed(nextMessage) {
      if (nextMessage) {
        current = nextMessage;
      }
      stop();
      writer(formatTextMessage(enabledColor, "success", current));
    },
    fail(nextMessage) {
      if (nextMessage) {
        current = nextMessage;
      }
      stop();
      writer(formatTextMessage(enabledColor, "error", current));
    },
  };
}

function formatTable(input: OutputTable): string {
  if (input.rows.length === 0) {
    return "(empty)\n";
  }

  const widths = input.columns.map((column) => {
    const values = input.rows.map((row) => String(row[column] ?? ""));
    return Math.max(column.length, ...values.map((value) => value.length));
  });

  const renderLine = (values: readonly string[]): string =>
    values
      .map((value, index) => value.padEnd(widths[index], " "))
      .join(" | ");

  const lines = [
    renderLine(input.columns),
    renderLine(widths.map((width) => "-".repeat(width))),
    ...input.rows.map((row) => renderLine(input.columns.map((column) => String(row[column] ?? "")))),
  ];

  return `${lines.join("\n")}\n`;
}

export function createOutput(options: OutputOptions = {}): OutputService {
  const mode = options.mode ?? "text";
  const quiet = options.quiet ?? false;
  const verbose = options.verbose ?? false;
  const color = options.color ?? true;
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));

  const writeMessage = (level: OutputLevel, message: string, details?: unknown) => {
    if (shouldSkip(level, { quiet, verbose })) {
      return;
    }

    const payload: OutputMessage = details === undefined ? { level, message } : { level, message, details };
    const writer = level === "error" ? stderr : stdout;

    if (mode === "json") {
      writer(stringifyJson(payload));
      return;
    }

    writer(formatTextMessage(color, level, message, details));
  };

  return {
    mode,
    debug(message, details) {
      writeMessage("debug", message, details);
    },
    info(message, details) {
      writeMessage("info", message, details);
    },
    success(message, details) {
      writeMessage("success", message, details);
    },
    warn(message, details) {
      writeMessage("warn", message, details);
    },
    error(message, details) {
      writeMessage("error", message, details);
    },
    json(value) {
      stdout(stringifyJson(value));
    },
    table(input) {
      if (quiet) {
        return;
      }

      if (mode === "json") {
        stdout(stringifyJson(input));
        return;
      }

      stdout(formatTable(input));
    },
    spinner(message) {
      if (quiet || mode === "json") {
        return createNoopSpinner();
      }
      return createSpinner(message, stderr, color);
    },
  };
}
