import { createInterface } from "node:readline/promises";

export async function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]: ` : ": ";
  const answer = await rl.question(question + suffix);
  rl.close();
  return answer.trim() || defaultValue || "";
}

export async function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question + ": ");
    const chars: string[] = [];

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners("data");
      process.stdout.write("\n");
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    process.stdin.on("data", (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(chars.join(""));
          return;
        } else if (char === "\x7f" || char === "\b") {
          if (chars.length > 0) {
            chars.pop();
            process.stdout.write("\b \b");
          }
        } else if (char === "\x03") {
          cleanup();
          process.exit(0);
        } else {
          chars.push(char);
          process.stdout.write("*");
        }
      }
    });
  });
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export type SelectOptions = {
  /** Extra body lines printed between the question and the choices. */
  body?: string;
};

/**
 * Interactive single-select.
 * - TTY: arrow-key selector with ❯ indicator (raw mode)
 * - Non-TTY: numbered 1-N list
 * Cancel on Ctrl+C.
 */
export async function select<T extends string>(
  question: string,
  options: SelectOption<T>[],
  opts: SelectOptions = {}
): Promise<T> {
  if (options.length === 0) {
    throw new Error("select() requires at least one option.");
  }

  const canRaw =
    Boolean(process.stdin.isTTY) &&
    Boolean(process.stdout.isTTY) &&
    typeof process.stdin.setRawMode === "function";

  if (canRaw) {
    return selectArrow(question, options, opts);
  }
  return selectNumbered(question, options, opts);
}

async function selectNumbered<T extends string>(
  question: string,
  options: SelectOption<T>[],
  opts: SelectOptions
): Promise<T> {
  process.stdout.write(`\n${question}\n`);
  if (opts.body) process.stdout.write(`\n${opts.body}\n`);
  process.stdout.write("\n");
  for (let i = 0; i < options.length; i++) {
    process.stdout.write(`  ${i + 1}. ${options[i].label}\n`);
  }
  process.stdout.write("\n");

  while (true) {
    const answer = await ask(`Enter a number (1-${options.length})`);
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      return options[n - 1].value;
    }
    process.stdout.write(`Please enter a number between 1 and ${options.length}.\n`);
  }
}

async function selectArrow<T extends string>(
  question: string,
  options: SelectOption<T>[],
  opts: SelectOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    let index = 0;
    let closed = false;

    const bodyLines = opts.body ? opts.body.split("\n") : [];
    // question + blank + body lines + blank + options
    const totalLines =
      1 + (bodyLines.length ? 1 + bodyLines.length + 1 : 1) + options.length;

    const render = (first = false) => {
      if (!first) {
        process.stdout.write(`\x1b[${totalLines}A`);
      }
      process.stdout.write(`\n${question}\n`);
      if (bodyLines.length) {
        process.stdout.write("\n");
        for (const line of bodyLines) {
          process.stdout.write(`${line}\n`);
        }
      }
      process.stdout.write("\n");
      for (let i = 0; i < options.length; i++) {
        const marker = i === index ? "❯" : " ";
        // Clear to end of line so longer labels do not leave residue
        process.stdout.write(`  ${marker} ${options[i].label}\x1b[K\n`);
      }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    const onData = (chunk: Buffer | string) => {
      const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        // Ctrl+C
        if (char === "\x03") {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        // Enter
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(options[index].value);
          return;
        }
        // Up arrow: ESC [ A
        if (char === "\x1b" && data[i + 1] === "[" && data[i + 2] === "A") {
          i += 2;
          index = (index - 1 + options.length) % options.length;
          render();
          continue;
        }
        // Down arrow: ESC [ B
        if (char === "\x1b" && data[i + 1] === "[" && data[i + 2] === "B") {
          i += 2;
          index = (index + 1) % options.length;
          render();
          continue;
        }
        // k / j vim-style
        if (char === "k") {
          index = (index - 1 + options.length) % options.length;
          render();
          continue;
        }
        if (char === "j") {
          index = (index + 1) % options.length;
          render();
          continue;
        }
        // Number keys 1-9
        if (char >= "1" && char <= "9") {
          const n = Number(char);
          if (n >= 1 && n <= options.length) {
            cleanup();
            process.stdout.write("\n");
            resolve(options[n - 1].value);
            return;
          }
        }
      }
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");
      process.stdin.on("data", onData);
      render(true);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
