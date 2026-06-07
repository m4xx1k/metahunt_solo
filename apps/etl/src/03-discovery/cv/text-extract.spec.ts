import { BadRequestException } from "@nestjs/common";

import { extractText } from "./text-extract";

function file(mimetype: string, content: string): Express.Multer.File {
  return {
    mimetype,
    buffer: Buffer.from(content, "utf8"),
  } as Express.Multer.File;
}

describe("extractText", () => {
  it("reads a text/plain upload straight off the buffer", async () => {
    const text = await extractText(file("text/plain", "Hello CV"));
    expect(text).toBe("Hello CV");
  });

  it("treats application/octet-stream as plain text", async () => {
    const text = await extractText(file("application/octet-stream", "raw"));
    expect(text).toBe("raw");
  });

  it("rejects an unsupported file type", async () => {
    await expect(extractText(file("image/png", "binary"))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
