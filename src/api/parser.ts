import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite';

export type Encoding = 'auto' | 'utf-8' | 'windows-1251';

export interface ParseResult {
    headers: string[];
    rows: any[];
    sheets?: string[]; // Available sheets for Excel files
    currentSheet?: string;
}

export interface ParseOptions {
    delimiter?: string;
    hasHeader?: boolean;
    sheetName?: string;
    encoding?: Encoding;
}

/**
 * Detect a real binary spreadsheet by its magic bytes.
 * Without this check we used to feed *every* buffer (including plain CSV/TSV
 * text) into XLSX.read(), which silently decodes text as latin1 — mangling
 * any Cyrillic / non-ASCII content unless the file happened to carry a UTF-8 BOM.
 *
 *   - XLSX / XLSB (ZIP container): "PK\x03\x04" (also \x05\x06, \x07\x08)
 *   - XLS (OLE2 compound file):    D0 CF 11 E0 A1 B1 1A E1
 */
function isSpreadsheet(buf: Buffer): boolean {
    if (buf.length < 8) return false;
    if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
        return true; // ZIP-based (xlsx/xlsb)
    }
    if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
        return true; // OLE2-based (legacy xls)
    }
    return false;
}

/**
 * Decode a text buffer (CSV/TSV) into a string with proper charset handling.
 *
 * Order of resolution:
 *   1. BOM (UTF-8 / UTF-16 LE / UTF-16 BE) — always authoritative.
 *   2. Explicit `encoding` override ('utf-8' | 'windows-1251').
 *   3. 'auto' — try UTF-8; if it produces replacement chars (U+FFFD) the bytes
 *      are not valid UTF-8, so fall back to Windows-1251 (the de-facto default
 *      for Russian CSVs exported from Excel on Windows).
 */
function decodeBuffer(buf: Buffer, encoding: Encoding = 'auto'): string {
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        return buf.subarray(3).toString('utf-8'); // UTF-8 BOM
    }
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
        return buf.subarray(2).toString('utf16le'); // UTF-16 LE BOM
    }
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
        return iconv.decode(buf.subarray(2), 'utf-16be'); // UTF-16 BE BOM
    }

    if (encoding === 'windows-1251') return iconv.decode(buf, 'win1251');
    if (encoding === 'utf-8') return buf.toString('utf-8');

    // auto-detect
    const utf8 = buf.toString('utf-8');
    if (utf8.includes('�')) {
        return iconv.decode(buf, 'win1251');
    }
    return utf8;
}

export function parseData(data: string | Buffer, options: ParseOptions = {}): ParseResult {
    if (Buffer.isBuffer(data)) {
        // Only attempt Excel parsing for actual spreadsheet binaries.
        if (isSpreadsheet(data)) {
            try {
                const workbook = XLSX.read(data, { type: 'buffer' });
                const sheetNames = workbook.SheetNames;

                if (sheetNames.length === 0) {
                    throw new Error('No sheets found in Excel file');
                }

                const targetSheet = options.sheetName && sheetNames.includes(options.sheetName)
                    ? options.sheetName
                    : sheetNames[0];

                const worksheet = workbook.Sheets[targetSheet];

                const rows: any[] = XLSX.utils.sheet_to_json(worksheet, {
                    header: options.hasHeader === false ? 1 : undefined // 1 = array of arrays (no keys)
                });

                let headers: string[] = [];
                if (rows.length > 0 && !Array.isArray(rows[0])) {
                    headers = Object.keys(rows[0]);
                }

                return {
                    headers,
                    rows,
                    sheets: sheetNames,
                    currentSheet: targetSheet
                };
            } catch (error) {
                // Malformed/edge-case spreadsheet — fall back to text decoding.
                return parseCsv(decodeBuffer(data, options.encoding), options);
            }
        }

        // Plain text source (CSV/TSV) — decode with charset detection.
        return parseCsv(decodeBuffer(data, options.encoding), options);
    }

    // If string, parse as CSV
    return parseCsv(data, options);
}

function parseCsv(data: string, options: ParseOptions): ParseResult {
    const config: Papa.ParseConfig = {
        header: options.hasHeader ?? true,
        skipEmptyLines: true,
        delimiter: options.delimiter === 'auto' ? undefined : options.delimiter,
    };

    // Auto-detect delimiter (comma / semicolon / tab) when not explicitly set.
    if (!options.delimiter || options.delimiter === 'auto') {
        const detected = detectDelimiter(data);
        if (detected) config.delimiter = detected;
    }

    const result = Papa.parse(data, config);

    if (result.errors && result.errors.length > 0) {
        console.warn('Parsing errors:', result.errors);
    }

    return {
        headers: result.meta.fields || [],
        rows: result.data as any[],
    };
}

/**
 * Pick the most likely delimiter by counting candidates on the header line.
 * Russian Excel exports frequently use ';', and TSV uses tabs — PapaParse's
 * own guesser is not always reliable for these, so we bias it explicitly.
 */
function detectDelimiter(data: string): string | undefined {
    const firstLine = data.split(/\r?\n/, 1)[0] || '';
    const candidates: Array<[string, number]> = [
        ['\t', (firstLine.match(/\t/g) || []).length],
        [';', (firstLine.match(/;/g) || []).length],
        [',', (firstLine.match(/,/g) || []).length],
    ];
    candidates.sort((a, b) => b[1] - a[1]);
    return candidates[0][1] > 0 ? candidates[0][0] : undefined;
}
