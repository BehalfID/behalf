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
