import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParseResult {
    headers: string[];
    rows: any[];
    sheets?: string[]; // Available sheets for Excel files
    currentSheet?: string;
}

export function parseData(data: string | Buffer, options: { delimiter?: string; hasHeader?: boolean; sheetName?: string } = {}): ParseResult {
    // If data is a Buffer, try to parse as Excel
    if (Buffer.isBuffer(data)) {
        try {
            const workbook = XLSX.read(data, { type: 'buffer' });
            const sheetNames = workbook.SheetNames;

            if (sheetNames.length === 0) {
                throw new Error('No sheets found in Excel file');
            }

            // Use specified sheet or default to the first one
            const targetSheet = options.sheetName && sheetNames.includes(options.sheetName)
                ? options.sheetName
                : sheetNames[0];

            const worksheet = workbook.Sheets[targetSheet];

            // Allow parsing without header, but typically Excel has headers. 
            // json conversion uses header: row 1 by default if not specified? 
            // sheet_to_json default treats first row as header.
            // If hasHeader is false, we should probably set header: 1 to get array of arrays?
            // But our system expects array of objects.
            // Let's stick to standard behavior: if hasHeader, first row is keys.

            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, {
                header: options.hasHeader === false ? 1 : undefined // 1 = array of arrays (no keys)
            });

            // If header is false, rows are arrays. We might need to map them to objects if we want consistency?
            // But existing 'papaparse' logic with header:false returns array of arrays (I think).
            // Actually PapaParse with header:true returns objects used by keys.
            // Let's extract headers from the first row if we used header detection.

            let headers: string[] = [];
            if (rows.length > 0 && !Array.isArray(rows[0])) {
                headers = Object.keys(rows[0]);
            } else if (rows.length > 0 && Array.isArray(rows[0])) {
                // If it's array of arrays, we generate headers? Or just return as is?
                // The current system relies on 'headers' array for mapping UI.
                // If imports are array of arrays (no header), keys are indices '0', '1', etc.
            }

            return {
                headers,
                rows,
                sheets: sheetNames,
                currentSheet: targetSheet
            };

        } catch (error) {
            // If Excel parsing fails (e.g. it's actually a CSV in a buffer), fallback to text decoding
            // console.warn('Excel parse failed, trying CSV:', error);
            const text = data.toString('utf-8');
            return parseCsv(text, options);
        }
    }

    // If string, parse as CSV
    return parseCsv(data, options);
}

function parseCsv(data: string, options: { delimiter?: string; hasHeader?: boolean }): ParseResult {
    const config: Papa.ParseConfig = {
        header: options.hasHeader ?? true,
        skipEmptyLines: true,
        delimiter: options.delimiter === 'auto' ? undefined : options.delimiter,
    };

    // Auto-detect tab for TSV if not specified
    if (!options.delimiter || options.delimiter === 'auto') {
        if (data.includes('\t') && !data.includes(',')) {
            config.delimiter = '\t';
        }
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
