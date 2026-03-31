import { Readable, Writable } from "node:stream";
import { InvalidJsonStdinError, readJsonStdin, writeJsonStdout } from "../src/stdio.js";

describe("stdio", () => {
  it("reads valid json deterministically", async () => {
    const input = Readable.from(['{"prompt":"/spec OAuth"}']);
    const parsed = await readJsonStdin<{ prompt: string }>(input);
    expect(parsed).toEqual({ prompt: "/spec OAuth" });
  });

  it("fails deterministically for invalid json", async () => {
    const input = Readable.from(["{invalid"]);
    await expect(readJsonStdin(input)).rejects.toBeInstanceOf(InvalidJsonStdinError);
  });

  it("writes one-line json document with newline", () => {
    let out = "";
    const output = new Writable({
      write(chunk, _encoding, callback) {
        out += chunk.toString();
        callback();
      },
    });

    writeJsonStdout({ ok: true }, output);
    expect(out).toBe('{"ok":true}\n');
  });
});
