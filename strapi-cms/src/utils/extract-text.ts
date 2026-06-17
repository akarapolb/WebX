/* สกัดข้อความจากไฟล์เอกสารเพื่อ Full-text Search (TOR 8.3): .pdf .docx .xlsx */
import fs from 'fs';

export async function extractText(absPath: string, extOrMime: string): Promise<string> {
  try {
    if (!absPath || !fs.existsSync(absPath)) return '';
    const e = String(extOrMime || '').toLowerCase();
    const buf = fs.readFileSync(absPath);
    if (e.includes('pdf')) {
      const pdf = require('pdf-parse');
      const d = await pdf(buf);
      return d.text || '';
    }
    if (e.includes('doc')) { // .docx
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ buffer: buf });
      return r.value || '';
    }
    if (e.includes('xls')) { // .xlsx
      const XLSX = require('xlsx');
      const wb = XLSX.read(buf, { type: 'buffer' });
      let t = '';
      wb.SheetNames.forEach((n: string) => { t += XLSX.utils.sheet_to_csv(wb.Sheets[n]) + '\n'; });
      return t;
    }
    // .pptx และอื่น ๆ ยังไม่รองรับในเดโม
    return '';
  } catch (e) {
    return '';
  }
}
