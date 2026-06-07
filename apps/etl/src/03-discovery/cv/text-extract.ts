import { BadRequestException } from "@nestjs/common";
import { extractText as pdfExtractText, getDocumentProxy } from "unpdf";

// Uploaded CV → plain text. PDF via unpdf (pure-JS, no native binaries);
// text/plain read straight off the buffer. Everything else is rejected.
export async function extractText(file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype;
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await pdfExtractText(pdf, { mergePages: true });
    return text;
  }
  if (mime === "text/plain" || mime === "application/octet-stream") {
    return file.buffer.toString("utf8");
  }
  throw new BadRequestException(`unsupported file type: ${mime}`);
}
