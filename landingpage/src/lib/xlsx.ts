/**
 * A small reader for .xlsx workbooks: enough to get cell values out of every sheet.
 * An .xlsx file is a ZIP of XML parts; the browser can inflate those itself, so no library is needed.
 * Formulas are read by their cached result, which Excel stores next to each formula.
 */

export type CellValue = string | number | boolean | Date | null
export type Sheet = { name: string; rows: CellValue[][] }
export type Workbook = { sheets: Sheet[] }

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number }

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end-of-central-directory record sits at the very end, after an optional comment.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('NOT_XLSX')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('NOT_XLSX')
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    entries.push({
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error('NOT_XLSX')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) throw new Error('NOT_XLSX')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

function decodeXml(text: string) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string) {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)
  return match ? decodeXml(match[1]) : ''
}

/** Text of a string item: every <t> run joined, without phonetic guides. */
function stringItemText(xml: string) {
  const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const match of plain.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += match[1]
  // Excel escapes control characters as _x000D_ and the like.
  return decodeXml(out).replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

function isDateFormat(code: string) {
  // Ignore quoted text and [colour]/[locale] blocks, then look for date or time letters.
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim())
}

/** For each cell style index: does it display its number as a date? */
function dateStyles(stylesXml: string) {
  const custom = new Map<number, string>()
  for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    custom.set(Number(attr(match[1], 'numFmtId')), attr(match[1], 'formatCode'))
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] || ''
  const flags: boolean[] = []
  for (const match of cellXfs.matchAll(/<xf\b([^>]*?)\/?>/g)) {
    const id = Number(attr(match[1], 'numFmtId'))
    flags.push(BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id) || '')))
  }
  return flags
}

function serialToDate(serial: number, date1904: boolean) {
  // Excel counts days from 1899-12-30 (or 1904-01-01 on old Mac workbooks). Built in UTC, read back in UTC.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  return new Date(epoch + Math.round(serial * 86400000))
}

function columnIndex(ref: string) {
  let index = 0
  for (const ch of ref) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    index = index * 26 + (code - 64)
  }
  return index - 1
}

function parseSheet(xml: string, strings: string[], dates: boolean[], date1904: boolean) {
  const rows: CellValue[][] = []
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowIndex = Number(attr(rowMatch[1], 'r')) - 1
    const row: CellValue[] = []
    for (const cellMatch of (rowMatch[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1]
      const body = cellMatch[2] || ''
      const type = attr(tag, 't')
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value: CellValue = null
      if (type === 'inlineStr') value = stringItemText(body)
      else if (raw === undefined) value = null
      else if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'str') value = decodeXml(raw)
      else if (type === 'b') value = raw === '1'
      else if (type === 'e') value = null
      else if (type === 'd') value = new Date(raw)
      else {
        const n = Number(raw)
        value = !Number.isFinite(n) ? null : dates[Number(attr(tag, 's'))] ? serialToDate(n, date1904) : n
      }
      const column = columnIndex(attr(tag, 'r'))
      if (column >= 0) row[column] = value
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null
    if (rowIndex >= 0) rows[rowIndex] = row
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
  return rows
}

export async function readWorkbook(file: Blob | ArrayBuffer): Promise<Workbook> {
  const bytes = new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer())
  const entries = readEntries(bytes)
  // Workbooks written by some tools (the .NET Open XML SDK among them) name every element with a
  // namespace prefix, <x:row> for <row>; without the prefixes they read like any other.
  const read = async (name: string) => {
    const entry = entries.find((item) => item.name === name)
    return entry ? (await readEntry(bytes, entry)).replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1') : ''
  }

  const workbookXml = await read('xl/workbook.xml')
  if (!workbookXml) throw new Error('NOT_XLSX')
  const relsXml = await read('xl/_rels/workbook.xml.rels')
  const targets = new Map<string, string>()
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) targets.set(attr(match[1], 'Id'), attr(match[1], 'Target'))

  const strings: string[] = []
  for (const match of (await read('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) strings.push(stringItemText(match[1] || ''))
  const dates = dateStyles(await read('xl/styles.xml'))
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbookXml)

  const sheets: Sheet[] = []
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const target = targets.get(attr(match[1], 'r:id')) || ''
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    sheets.push({ name: attr(match[1], 'name'), rows: parseSheet(await read(path), strings, dates, date1904) })
  }
  return { sheets }
}
