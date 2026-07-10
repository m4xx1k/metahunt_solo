import { BadRequestException } from "@nestjs/common";

import { extractText as pdfExtractText, getDocumentProxy } from "unpdf";

const PDF_MAGIC = "%PDF-";

// Uploaded CV -> plain text. Trust file CONTENT, not the client-declared MIME:
// sniff the PDF magic header, else require a NUL-free (i.e. text) buffer.
export async function extractText(file: Express.Multer.File): Promise<string> {
  const buf = file.buffer;
  if (buf.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfExtractText(pdf, { mergePages: true });
    return text;
  }
  // A NUL byte marks binary content, not a text CV.
  if (buf.includes(0)) {
    throw new BadRequestException("unsupported file: expected a PDF or UTF-8 text CV");
  }
  return buf.toString("utf8");
}
