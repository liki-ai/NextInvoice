// Reads the old binary Excel format (.xls, Excel 97–2003), which banks still export statements in:
// cell texts and numbers of every worksheet, nothing else. Formatting is not read, so a date
// arrives as Excel's day number and the caller decides which columns hold dates.

import type { CellValue, Sheet, Workbook } from './xlsx'

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const END_OF_CHAIN = 0xfffffffa
const MAX_SECTORS = 1 << 20

export function isLegacyWorkbook(bytes: Uint8Array) {
  return bytes.length > 512 && SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/** The workbook's own byte stream, taken out of the compound file that wraps it. */
function workbookStream(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sectorSize = 1 << view.getUint16(30, true)
  const miniSectorSize = 1 << view.getUint16(32, true)
  const fatSectorCount = view.getUint32(44, true)
  const directoryStart = view.getUint32(48, true)
  const miniCutoff = view.getUint32(56, true)
  const miniFatStart = view.getUint32(60, true)
  const offsetOf = (sector: number) => (sector + 1) * sectorSize
  const perSector = sectorSize / 4

  // Where the allocation table itself is stored: 109 entries in the header, the rest chained.
  const fatSectors: number[] = []
  for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i += 1) {
    const sector = view.getUint32(76 + i * 4, true)
    if (sector < END_OF_CHAIN) fatSectors.push(sector)
  }
  let more = view.getUint32(68, true)
  for (let guard = 0; more < END_OF_CHAIN && fatSectors.length < fatSectorCount && guard < MAX_SECTORS; guard += 1) {
    const base = offsetOf(more)
    for (let i = 0; i < perSector - 1 && fatSectors.length < fatSectorCount; i += 1) {
      const sector = view.getUint32(base + i * 4, true)
      if (sector < END_OF_CHAIN) fatSectors.push(sector)
    }
    more = view.getUint32(base + (perSector - 1) * 4, true)
  }

  const nextSector = (sector: number) => {
    const holder = fatSectors[Math.floor(sector / perSector)]
    if (holder === undefined) return END_OF_CHAIN
    const at = offsetOf(holder) + (sector % perSector) * 4
    return at + 4 <= bytes.length ? view.getUint32(at, true) : END_OF_CHAIN
  }
  const readChain = (start: number) => {
    const sectors: number[] = []
    for (let sector = start; sector < END_OF_CHAIN && sectors.length < MAX_SECTORS; sector = nextSector(sector)) sectors.push(sector)
    const out = new Uint8Array(sectors.length * sectorSize)
    sectors.forEach((sector, index) => out.set(bytes.subarray(offsetOf(sector), offsetOf(sector) + sectorSize), index * sectorSize))
    return out
  }

  const directory = readChain(directoryStart)
  const dirView = new DataView(directory.buffer)
  let root: { start: number; size: number } | null = null
  let book: { start: number; size: number } | null = null
  for (let at = 0; at + 128 <= directory.length; at += 128) {
    const type = directory[at + 66]
    const nameLength = Math.max(dirView.getUint16(at + 64, true) - 2, 0)
    let name = ''
    for (let i = 0; i < nameLength && i < 62; i += 2) name += String.fromCharCode(dirView.getUint16(at + i, true))
    const entry = { start: dirView.getUint32(at + 116, true), size: dirView.getUint32(at + 120, true) }
    if (type === 5) root = entry
    else if (type === 2 && (name === 'Workbook' || (name === 'Book' && !book))) book = entry
  }
  if (!book) throw new Error('XLS_NO_WORKBOOK')
  if (book.size >= miniCutoff) return readChain(book.start).subarray(0, book.size)

  // A small stream lives in the root entry's stream, cut into its own smaller sectors.
  if (!root) throw new Error('XLS_NO_WORKBOOK')
  const miniStream = readChain(root.start)
  const miniFat = readChain(miniFatStart)
  const miniFatView = new DataView(miniFat.buffer)
  const out = new Uint8Array(book.size)
  let written = 0
  for (let sector = book.start, guard = 0; sector < END_OF_CHAIN && written < book.size && guard < MAX_SECTORS; guard += 1) {
    const from = sector * miniSectorSize
    const part = miniStream.subarray(from, from + Math.min(miniSectorSize, book.size - written))
    out.set(part, written)
    written += part.length
    sector = (sector + 1) * 4 <= miniFat.length ? miniFatView.getUint32(sector * 4, true) : END_OF_CHAIN
  }
  return out
}

type BiffRecord = { id: number; data: Uint8Array }

function* records(stream: Uint8Array, from: number): Generator<BiffRecord & { offset: number }> {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
  for (let at = from; at + 4 <= stream.length; ) {
    const id = view.getUint16(at, true)
    const length = view.getUint16(at + 2, true)
    yield { id, data: stream.subarray(at + 4, at + 4 + length), offset: at }
    at += 4 + length
  }
}

/** A text as cells and sheet names store it: character count, a flag byte, then the characters. */
function readText(data: Uint8Array, at: number, countBytes: 1 | 2) {
  const count = countBytes === 1 ? data[at] : data[at] | (data[at + 1] << 8)
  const flags = data[at + countBytes]
  let pos = at + countBytes + 1
  if (flags & 0x08) pos += 2
  if (flags & 0x04) pos += 4
  let text = ''
  for (let i = 0; i < count && pos < data.length; i += 1) {
    if (flags & 0x01) {
      text += String.fromCharCode(data[pos] | (data[pos + 1] << 8))
      pos += 2
    } else {
      text += String.fromCharCode(data[pos])
      pos += 1
    }
  }
  return text
}

/**
 * The shared texts of the workbook. The table runs over several records, and a text cut by a
 * record boundary restarts with a fresh flag byte saying how its remaining characters are stored.
 */
function sharedTexts(parts: Uint8Array[]): string[] {
  const texts: string[] = []
  if (parts.length === 0) return texts
  let part = 0
  let pos = 8
  const total = new DataView(parts[0].buffer, parts[0].byteOffset, parts[0].byteLength).getUint32(4, true)
  const byte = () => parts[part][pos++]
  const settle = () => {
    while (part < parts.length && pos >= parts[part].length) {
      part += 1
      pos = 0
    }
    return part < parts.length
  }
  const skip = (count: number) => {
    for (let left = count; left > 0 && settle(); ) {
      const step = Math.min(left, parts[part].length - pos)
      pos += step
      left -= step
    }
  }
  while (texts.length < total && settle()) {
    const count = byte() | (byte() << 8)
    let flags = byte()
    const runs = flags & 0x08 ? byte() | (byte() << 8) : 0
    const extra = flags & 0x04 ? byte() | (byte() << 8) | (byte() << 16) | (byte() << 24) : 0
    let text = ''
    for (let left = count; left > 0; ) {
      if (pos >= parts[part].length) {
        part += 1
        pos = 0
        if (part >= parts.length) break
        flags = (flags & ~0x01) | (byte() & 0x01)
      }
      const wide = (flags & 0x01) === 1
      const room = Math.floor((parts[part].length - pos) / (wide ? 2 : 1))
      const take = Math.min(left, room)
      for (let i = 0; i < take; i += 1) text += String.fromCharCode(wide ? byte() | (byte() << 8) : byte())
      left -= take
      if (take === 0 && room === 0 && pos < parts[part].length) pos = parts[part].length
    }
    texts.push(text)
    skip(runs * 4 + extra)
  }
  return texts
}

function rkNumber(rk: number) {
  let value: number
  if (rk & 0x02) value = rk >> 2
  else {
    const buffer = new DataView(new ArrayBuffer(8))
    buffer.setUint32(4, rk & 0xfffffffc, true)
    value = buffer.getFloat64(0, true)
  }
  return rk & 0x01 ? value / 100 : value
}

function parseSheet(stream: Uint8Array, offset: number, texts: string[]): CellValue[][] {
  const rows: CellValue[][] = []
  const put = (row: number, column: number, value: CellValue) => {
    if (row > 200000 || column > 1000) return
    while (rows.length <= row) rows.push([])
    const cells = rows[row]
    while (cells.length <= column) cells.push(null)
    cells[column] = value
  }
  let formulaCell: [number, number] | null = null
  let depth = 0
  for (const { id, data } of records(stream, offset)) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (id === 0x0809) {
      depth += 1
      continue
    }
    if (id === 0x000a) {
      depth -= 1
      if (depth <= 0) break
      continue
    }
    if (depth !== 1 || data.length < 6) continue
    const row = view.getUint16(0, true)
    const column = view.getUint16(2, true)
    if (id === 0x00fd && data.length >= 10) put(row, column, texts[view.getUint32(6, true)] ?? '')
    else if (id === 0x0203 && data.length >= 14) put(row, column, view.getFloat64(6, true))
    else if (id === 0x027e && data.length >= 10) put(row, column, rkNumber(view.getInt32(6, true)))
    else if (id === 0x00bd) {
      for (let at = 4, col = column; at + 6 <= data.length - 2; at += 6, col += 1) put(row, col, rkNumber(view.getInt32(at + 2, true)))
    } else if (id === 0x0204 && data.length >= 9) put(row, column, readText(data, 6, 2))
    else if (id === 0x0006 && data.length >= 14) {
      if (view.getUint16(12, true) === 0xffff) formulaCell = data[6] === 0 ? [row, column] : null
      else put(row, column, view.getFloat64(6, true))
    } else if (id === 0x0207 && formulaCell) {
      put(formulaCell[0], formulaCell[1], readText(data, 0, 2))
      formulaCell = null
    }
  }
  return rows
}

/** Every worksheet of an .xls file, as rows of cell values. */
export function readLegacyWorkbook(bytes: Uint8Array): Workbook {
  if (!isLegacyWorkbook(bytes)) throw new Error('XLS_NOT_A_WORKBOOK')
  const stream = workbookStream(bytes)
  const sheetEntries: { name: string; offset: number }[] = []
  const textParts: Uint8Array[] = []
  let collecting = false
  for (const { id, data } of records(stream, 0)) {
    if (id === 0x0809) {
      // Only the format Excel has written since 1997 is read; older ones store text differently.
      if (data.length < 2 || (data[0] | (data[1] << 8)) !== 0x0600) throw new Error('XLS_TOO_OLD')
    }
    if (id === 0x002f) throw new Error('XLS_PROTECTED')
    if (id === 0x00fc) {
      textParts.push(data)
      collecting = true
    } else if (id === 0x003c && collecting) textParts.push(data)
    else collecting = false
    if (id === 0x0085 && data.length >= 8 && data[5] === 0) {
      sheetEntries.push({ offset: new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true), name: readText(data, 6, 1) })
    }
    if (id === 0x000a) break
  }
  const texts = sharedTexts(textParts)
  const sheets: Sheet[] = sheetEntries.map((entry) => ({ name: entry.name, rows: parseSheet(stream, entry.offset, texts) }))
  return { sheets }
}
