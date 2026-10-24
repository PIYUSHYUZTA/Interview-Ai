import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export class ResumeFileError extends Error {}
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Files stay in memory. Never render uploaded HTML or follow external references. */
export async function extractResumeFile(fileName: string, data: Buffer): Promise<string> {
  if (!data.length || data.length > MAX_RESUME_BYTES) throw new ResumeFileError('Choose a non-empty file smaller than 5 MB.');
  let text: string;
  try {
    if (/\.pdf$/i.test(fileName)) {
      if (data.subarray(0, 5).toString() !== '%PDF-') throw new ResumeFileError('This file is not a valid PDF.');
      const parser = new PDFParse({ data: new Uint8Array(data), isEvalSupported: false });
      try {
        const info = await parser.getInfo();
        if (info.total > 30) throw new ResumeFileError('Resumes may contain up to 30 pages.');
        text = (await parser.getText({ pageJoiner: '\n' })).text;
      } finally { await parser.destroy(); }
    } else if (/\.docx$/i.test(fileName)) {
      if (data.readUInt16LE(0) !== 0x4b50) throw new ResumeFileError('This file is not a valid DOCX.');
      // Bound the expanded ZIP size before the XML extractor allocates its contents.
      let expanded = 0;
      let entries = 0;
      for (let i = 0; i + 46 <= data.length; i++) {
        if (data.readUInt32LE(i) === 0x02014b50) {
          expanded += data.readUInt32LE(i + 24);
          entries++;
          if (expanded > 20 * 1024 * 1024 || entries > 1000) throw new ResumeFileError('This DOCX is too large when expanded. Please export a simpler resume.');
          i += 45 + data.readUInt16LE(i + 28) + data.readUInt16LE(i + 30) + data.readUInt16LE(i + 32);
        }
      }
      if (!entries) throw new ResumeFileError('The DOCX archive is invalid.');
      text = (await mammoth.extractRawText({ buffer: data })).value;
    } else throw new ResumeFileError('Supported resume formats are PDF and DOCX.');
  } catch (error) {
    if (error instanceof ResumeFileError) throw error;
    throw new ResumeFileError('Unable to read this document. It may be damaged or password-protected. Try exporting it again or paste its text.');
  }
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 10) throw new ResumeFileError('No readable text was found. Scanned PDFs need OCR; paste the resume text instead.');
  if (text.length > 100_000) throw new ResumeFileError('The extracted resume is too long. Limit it to 100,000 characters.');
  return text;
}
