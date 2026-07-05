import { BadRequestException } from "@nestjs/common";

import { extractText } from "./text-extract";

function file(mimetype: string, content: Buffer | string): Express.Multer.File {
  return {
    mimetype,
    buffer: typeof content === "string" ? Buffer.from(content, "utf8") : content,
  } as Express.Multer.File;
}

describe("extractText", () => {
  it("reads a UTF-8 text upload straight off the buffer", async () => {
    const text = await extractText(file("text/plain", "Hello CV"));
    expect(text).toBe("Hello CV");
  });

  it("accepts text regardless of the declared mime type", async () => {
    const text = await extractText(file("application/octet-stream", "raw"));
    expect(text).toBe("raw");
  });

  it("rejects binary content (NUL byte) even when mislabeled as text", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]);
    await expect(
      extractText(file("text/plain", binary)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
