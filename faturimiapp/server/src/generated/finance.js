// Generated from landingpage/src/lib/serverFinance.ts by landingpage/scripts/build-server-render.mjs. Do not edit.
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/lib/document.ts
function activePayments(payments) {
	return (payments || []).filter((item) => !item.voidedAt);
}
const MONTH_ABBR = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC"
];
function parseLooseDate(value) {
	if (!value) return null;
	const raw = String(value).trim();
	const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
	if (isoDay) return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
	const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
	if (dmy) {
		const monthFirst = Number(dmy[2]) > 12 && Number(dmy[1]) <= 12;
		return new Date(Number(dmy[3]), Number(dmy[monthFirst ? 1 : 2]) - 1, Number(dmy[monthFirst ? 2 : 1]));
	}
	const mdy = raw.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i);
	if (mdy) {
		const month = MONTH_ABBR.indexOf(mdy[1].toUpperCase());
		if (month >= 0) return new Date(Number(mdy[3]), month, Number(mdy[2]));
	}
	const iso = Date.parse(raw);
	if (Number.isFinite(iso)) return new Date(iso);
	return null;
}
//#endregion
//#region src/lib/xls.ts
const SIGNATURE = [
	208,
	207,
	17,
	224,
	161,
	177,
	26,
	225
];
const END_OF_CHAIN = 4294967290;
const MAX_SECTORS = 1 << 20;
function isLegacyWorkbook(bytes) {
	return bytes.length > 512 && SIGNATURE.every((byte, index) => bytes[index] === byte);
}
/** The workbook's own byte stream, taken out of the compound file that wraps it. */
function workbookStream(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const sectorSize = 1 << view.getUint16(30, true);
	const miniSectorSize = 1 << view.getUint16(32, true);
	const fatSectorCount = view.getUint32(44, true);
	const directoryStart = view.getUint32(48, true);
	const miniCutoff = view.getUint32(56, true);
	const miniFatStart = view.getUint32(60, true);
	const offsetOf = (sector) => (sector + 1) * sectorSize;
	const perSector = sectorSize / 4;
	const fatSectors = [];
	for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i += 1) {
		const sector = view.getUint32(76 + i * 4, true);
		if (sector < END_OF_CHAIN) fatSectors.push(sector);
	}
	let more = view.getUint32(68, true);
	for (let guard = 0; more < END_OF_CHAIN && fatSectors.length < fatSectorCount && guard < MAX_SECTORS; guard += 1) {
		const base = offsetOf(more);
		for (let i = 0; i < perSector - 1 && fatSectors.length < fatSectorCount; i += 1) {
			const sector = view.getUint32(base + i * 4, true);
			if (sector < END_OF_CHAIN) fatSectors.push(sector);
		}
		more = view.getUint32(base + (perSector - 1) * 4, true);
	}
	const nextSector = (sector) => {
		const holder = fatSectors[Math.floor(sector / perSector)];
		if (holder === void 0) return END_OF_CHAIN;
		const at = offsetOf(holder) + sector % perSector * 4;
		return at + 4 <= bytes.length ? view.getUint32(at, true) : END_OF_CHAIN;
	};
	const readChain = (start) => {
		const sectors = [];
		for (let sector = start; sector < END_OF_CHAIN && sectors.length < MAX_SECTORS; sector = nextSector(sector)) sectors.push(sector);
		const out = new Uint8Array(sectors.length * sectorSize);
		sectors.forEach((sector, index) => out.set(bytes.subarray(offsetOf(sector), offsetOf(sector) + sectorSize), index * sectorSize));
		return out;
	};
	const directory = readChain(directoryStart);
	const dirView = new DataView(directory.buffer);
	let root = null;
	let book = null;
	for (let at = 0; at + 128 <= directory.length; at += 128) {
		const type = directory[at + 66];
		const nameLength = Math.max(dirView.getUint16(at + 64, true) - 2, 0);
		let name = "";
		for (let i = 0; i < nameLength && i < 62; i += 2) name += String.fromCharCode(dirView.getUint16(at + i, true));
		const entry = {
			start: dirView.getUint32(at + 116, true),
			size: dirView.getUint32(at + 120, true)
		};
		if (type === 5) root = entry;
		else if (type === 2 && (name === "Workbook" || name === "Book" && !book)) book = entry;
	}
	if (!book) throw new Error("XLS_NO_WORKBOOK");
	if (book.size >= miniCutoff) return readChain(book.start).subarray(0, book.size);
	if (!root) throw new Error("XLS_NO_WORKBOOK");
	const miniStream = readChain(root.start);
	const miniFat = readChain(miniFatStart);
	const miniFatView = new DataView(miniFat.buffer);
	const out = new Uint8Array(book.size);
	let written = 0;
	for (let sector = book.start, guard = 0; sector < END_OF_CHAIN && written < book.size && guard < MAX_SECTORS; guard += 1) {
		const from = sector * miniSectorSize;
		const part = miniStream.subarray(from, from + Math.min(miniSectorSize, book.size - written));
		out.set(part, written);
		written += part.length;
		sector = (sector + 1) * 4 <= miniFat.length ? miniFatView.getUint32(sector * 4, true) : END_OF_CHAIN;
	}
	return out;
}
function* records(stream, from) {
	const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
	for (let at = from; at + 4 <= stream.length;) {
		const id = view.getUint16(at, true);
		const length = view.getUint16(at + 2, true);
		yield {
			id,
			data: stream.subarray(at + 4, at + 4 + length),
			offset: at
		};
		at += 4 + length;
	}
}
/** A text as cells and sheet names store it: character count, a flag byte, then the characters. */
function readText(data, at, countBytes) {
	const count = countBytes === 1 ? data[at] : data[at] | data[at + 1] << 8;
	const flags = data[at + countBytes];
	let pos = at + countBytes + 1;
	if (flags & 8) pos += 2;
	if (flags & 4) pos += 4;
	let text = "";
	for (let i = 0; i < count && pos < data.length; i += 1) if (flags & 1) {
		text += String.fromCharCode(data[pos] | data[pos + 1] << 8);
		pos += 2;
	} else {
		text += String.fromCharCode(data[pos]);
		pos += 1;
	}
	return text;
}
/**
* The shared texts of the workbook. The table runs over several records, and a text cut by a
* record boundary restarts with a fresh flag byte saying how its remaining characters are stored.
*/
function sharedTexts(parts) {
	const texts = [];
	if (parts.length === 0) return texts;
	let part = 0;
	let pos = 8;
	const total = new DataView(parts[0].buffer, parts[0].byteOffset, parts[0].byteLength).getUint32(4, true);
	const byte = () => parts[part][pos++];
	const settle = () => {
		while (part < parts.length && pos >= parts[part].length) {
			part += 1;
			pos = 0;
		}
		return part < parts.length;
	};
	const skip = (count) => {
		for (let left = count; left > 0 && settle();) {
			const step = Math.min(left, parts[part].length - pos);
			pos += step;
			left -= step;
		}
	};
	while (texts.length < total && settle()) {
		const count = byte() | byte() << 8;
		let flags = byte();
		const runs = flags & 8 ? byte() | byte() << 8 : 0;
		const extra = flags & 4 ? byte() | byte() << 8 | byte() << 16 | byte() << 24 : 0;
		let text = "";
		for (let left = count; left > 0;) {
			if (pos >= parts[part].length) {
				part += 1;
				pos = 0;
				if (part >= parts.length) break;
				flags = flags & -2 | byte() & 1;
			}
			const wide = (flags & 1) === 1;
			const room = Math.floor((parts[part].length - pos) / (wide ? 2 : 1));
			const take = Math.min(left, room);
			for (let i = 0; i < take; i += 1) text += String.fromCharCode(wide ? byte() | byte() << 8 : byte());
			left -= take;
			if (take === 0 && room === 0 && pos < parts[part].length) pos = parts[part].length;
		}
		texts.push(text);
		skip(runs * 4 + extra);
	}
	return texts;
}
function rkNumber(rk) {
	let value;
	if (rk & 2) value = rk >> 2;
	else {
		const buffer = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
		buffer.setUint32(4, rk & 4294967292, true);
		value = buffer.getFloat64(0, true);
	}
	return rk & 1 ? value / 100 : value;
}
function parseSheet$1(stream, offset, texts) {
	const rows = [];
	const put = (row, column, value) => {
		if (row > 2e5 || column > 1e3) return;
		while (rows.length <= row) rows.push([]);
		const cells = rows[row];
		while (cells.length <= column) cells.push(null);
		cells[column] = value;
	};
	let formulaCell = null;
	let depth = 0;
	for (const { id, data } of records(stream, offset)) {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		if (id === 2057) {
			depth += 1;
			continue;
		}
		if (id === 10) {
			depth -= 1;
			if (depth <= 0) break;
			continue;
		}
		if (depth !== 1 || data.length < 6) continue;
		const row = view.getUint16(0, true);
		const column = view.getUint16(2, true);
		if (id === 253 && data.length >= 10) put(row, column, texts[view.getUint32(6, true)] ?? "");
		else if (id === 515 && data.length >= 14) put(row, column, view.getFloat64(6, true));
		else if (id === 638 && data.length >= 10) put(row, column, rkNumber(view.getInt32(6, true)));
		else if (id === 189) for (let at = 4, col = column; at + 6 <= data.length - 2; at += 6, col += 1) put(row, col, rkNumber(view.getInt32(at + 2, true)));
		else if (id === 516 && data.length >= 9) put(row, column, readText(data, 6, 2));
		else if (id === 6 && data.length >= 14) if (view.getUint16(12, true) === 65535) formulaCell = data[6] === 0 ? [row, column] : null;
		else put(row, column, view.getFloat64(6, true));
		else if (id === 519 && formulaCell) {
			put(formulaCell[0], formulaCell[1], readText(data, 0, 2));
			formulaCell = null;
		}
	}
	return rows;
}
/** Every worksheet of an .xls file, as rows of cell values. */
function readLegacyWorkbook(bytes) {
	if (!isLegacyWorkbook(bytes)) throw new Error("XLS_NOT_A_WORKBOOK");
	const stream = workbookStream(bytes);
	const sheetEntries = [];
	const textParts = [];
	let collecting = false;
	for (const { id, data } of records(stream, 0)) {
		if (id === 2057) {
			if (data.length < 2 || (data[0] | data[1] << 8) !== 1536) throw new Error("XLS_TOO_OLD");
		}
		if (id === 47) throw new Error("XLS_PROTECTED");
		if (id === 252) {
			textParts.push(data);
			collecting = true;
		} else if (id === 60 && collecting) textParts.push(data);
		else collecting = false;
		if (id === 133 && data.length >= 8 && data[5] === 0) sheetEntries.push({
			offset: new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true),
			name: readText(data, 6, 1)
		});
		if (id === 10) break;
	}
	const texts = sharedTexts(textParts);
	return { sheets: sheetEntries.map((entry) => ({
		name: entry.name,
		rows: parseSheet$1(stream, entry.offset, texts)
	})) };
}
//#endregion
//#region src/lib/xlsx.ts
function readEntries(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (view.getUint32(i, true) === 101010256) {
		end = i;
		break;
	}
	if (end < 0) throw new Error("NOT_XLSX");
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const decoder = new TextDecoder();
	const entries = [];
	for (let i = 0; i < count; i++) {
		if (view.getUint32(at, true) !== 33639248) throw new Error("NOT_XLSX");
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		entries.push({
			name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
			method: view.getUint16(at + 10, true),
			compressedSize: view.getUint32(at + 20, true),
			offset: view.getUint32(at + 42, true)
		});
		at += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
async function readEntry(bytes, entry) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(entry.offset, true) !== 67324752) throw new Error("NOT_XLSX");
	const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
	const data = bytes.subarray(start, start + entry.compressedSize);
	if (entry.method === 0) return new TextDecoder().decode(data);
	if (entry.method !== 8) throw new Error("NOT_XLSX");
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
	return new Response(stream).text();
}
function decodeXml(text) {
	return text.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function attr(tag, name) {
	const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
	return match ? decodeXml(match[1]) : "";
}
/** Text of a string item: every <t> run joined, without phonetic guides. */
function stringItemText(xml) {
	const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
	let out = "";
	for (const match of plain.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += match[1];
	return decodeXml(out).replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}
const BUILTIN_DATE_FORMATS = /* @__PURE__ */ new Set([
	14,
	15,
	16,
	17,
	18,
	19,
	20,
	21,
	22,
	27,
	28,
	29,
	30,
	31,
	32,
	33,
	34,
	35,
	36,
	45,
	46,
	47,
	50,
	51,
	52,
	53,
	54,
	55,
	56,
	57,
	58
]);
function isDateFormat(code) {
	const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
	return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}
/** For each cell style index: does it display its number as a date? */
function dateStyles(stylesXml) {
	const custom = /* @__PURE__ */ new Map();
	for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) custom.set(Number(attr(match[1], "numFmtId")), attr(match[1], "formatCode"));
	const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] || "";
	const flags = [];
	for (const match of cellXfs.matchAll(/<xf\b([^>]*?)\/?>/g)) {
		const id = Number(attr(match[1], "numFmtId"));
		flags.push(BUILTIN_DATE_FORMATS.has(id) || custom.has(id) && isDateFormat(custom.get(id) || ""));
	}
	return flags;
}
function serialToDate(serial, date1904) {
	return new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.round(serial * 864e5));
}
function columnIndex(ref) {
	let index = 0;
	for (const ch of ref) {
		const code = ch.charCodeAt(0);
		if (code < 65 || code > 90) break;
		index = index * 26 + (code - 64);
	}
	return index - 1;
}
function parseSheet(xml, strings, dates, date1904) {
	const rows = [];
	for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
		const rowIndex = Number(attr(rowMatch[1], "r")) - 1;
		const row = [];
		for (const cellMatch of (rowMatch[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const tag = cellMatch[1];
			const body = cellMatch[2] || "";
			const type = attr(tag, "t");
			const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
			let value = null;
			if (type === "inlineStr") value = stringItemText(body);
			else if (raw === void 0) value = null;
			else if (type === "s") value = strings[Number(raw)] ?? "";
			else if (type === "str") value = decodeXml(raw);
			else if (type === "b") value = raw === "1";
			else if (type === "e") value = null;
			else if (type === "d") value = new Date(raw);
			else {
				const n = Number(raw);
				value = !Number.isFinite(n) ? null : dates[Number(attr(tag, "s"))] ? serialToDate(n, date1904) : n;
			}
			const column = columnIndex(attr(tag, "r"));
			if (column >= 0) row[column] = value;
		}
		for (let i = 0; i < row.length; i++) if (row[i] === void 0) row[i] = null;
		if (rowIndex >= 0) rows[rowIndex] = row;
	}
	for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
	return rows;
}
async function readWorkbook(file) {
	const bytes = new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());
	const entries = readEntries(bytes);
	const read = async (name) => {
		const entry = entries.find((item) => item.name === name);
		return entry ? readEntry(bytes, entry) : "";
	};
	const workbookXml = await read("xl/workbook.xml");
	if (!workbookXml) throw new Error("NOT_XLSX");
	const relsXml = await read("xl/_rels/workbook.xml.rels");
	const targets = /* @__PURE__ */ new Map();
	for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) targets.set(attr(match[1], "Id"), attr(match[1], "Target"));
	const strings = [];
	for (const match of (await read("xl/sharedStrings.xml")).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) strings.push(stringItemText(match[1] || ""));
	const dates = dateStyles(await read("xl/styles.xml"));
	const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbookXml);
	const sheets = [];
	for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
		const target = targets.get(attr(match[1], "r:id")) || "";
		if (!target) continue;
		const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
		sheets.push({
			name: attr(match[1], "name"),
			rows: parseSheet(await read(path), strings, dates, date1904)
		});
	}
	return { sheets };
}
//#endregion
//#region src/lib/bankMatch.ts
const cents = (value) => Math.round((Number(value) || 0) * 100);
function plain(value) {
	return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isoDate(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** A statement's date cell: a real date, Excel's day number, or text such as 13.10.2026. */
function cellDate(value) {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : isoDate(value);
	if (typeof value === "number") {
		if (value < 2e4 || value > 8e4) return "";
		const date = new Date(Math.round((value - 25569) * 864e5));
		return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
	}
	const text = String(value ?? "").trim();
	if (!text) return "";
	if (/^\d{5}(\.\d+)?$/.test(text)) return cellDate(Number(text));
	const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
	if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
	const parsed = parseLooseDate(text);
	return parsed ? isoDate(parsed) : "";
}
/** An amount cell: a number, or text written either as 1,183.00 or as 1.183,00. */
function cellAmount(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	let text = String(value ?? "").replace(/[^\d.,-]/g, "");
	if (!text) return 0;
	const comma = text.lastIndexOf(",");
	const dot = text.lastIndexOf(".");
	if (comma !== -1 && dot !== -1) text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
	else if (comma !== -1) text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
	const amount = Number(text);
	return Number.isFinite(amount) ? amount : 0;
}
const HEADERS = {
	date: [
		"date",
		"data",
		"datum"
	],
	credit: [
		"kredit",
		"credit",
		"hyrje",
		"hyrese",
		"incoming",
		"deposit",
		"paidin",
		"avere",
		"entrate"
	],
	debit: [
		"debit",
		"dalje",
		"dalese",
		"outgoing",
		"withdraw",
		"paidout",
		"dare",
		"uscite"
	],
	amount: [
		"amount",
		"shuma",
		"vlera",
		"importo"
	],
	text: [
		"koment",
		"comment",
		"pershkrim",
		"description",
		"detaj",
		"detail",
		"narrative",
		"qellimi",
		"purpose",
		"causale",
		"descrizione",
		"reference"
	]
};
function findColumns(row) {
	const columns = {
		date: -1,
		credit: -1,
		debit: -1,
		amount: -1,
		text: []
	};
	row.forEach((cell, index) => {
		const name = plain(cell).replace(/[^a-z]/g, "");
		if (!name) return;
		const has = (words) => words.some((word) => name.includes(word));
		if (has(HEADERS.credit) && !has(HEADERS.debit)) {
			if (columns.credit === -1) columns.credit = index;
		} else if (has(HEADERS.debit)) {
			if (columns.debit === -1) columns.debit = index;
		} else if (has(HEADERS.text)) columns.text.push(index);
		else if (has(HEADERS.date)) {
			if (columns.date === -1) columns.date = index;
		} else if (has(HEADERS.amount)) {
			if (columns.amount === -1) columns.amount = index;
		}
	});
	if (columns.date === -1 || columns.credit === -1 && columns.amount === -1) return null;
	return columns;
}
/** Dates written out in the lines above the table, where a statement prints the period it covers. */
function statedDates(rows) {
	const found = [];
	for (const row of rows) for (const cell of row) {
		if (typeof cell !== "string") continue;
		for (const [, day, month, year] of cell.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g)) found.push(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
		for (const [, year, month, day] of cell.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) found.push(`${year}-${month}-${day}`);
	}
	return found.filter((day) => !Number.isNaN(Date.parse(day)));
}
/** The incoming payments of a bank statement, found by its column headings. Null when it has none. */
function readStatement(workbook) {
	for (const sheet of workbook.sheets) for (let head = 0; head < Math.min(sheet.rows.length, 60); head += 1) {
		const columns = findColumns(sheet.rows[head] || []);
		if (!columns) continue;
		const lines = [];
		let from = "";
		let to = "";
		for (const row of sheet.rows.slice(head + 1)) {
			const date = cellDate(row[columns.date] ?? null);
			if (!date) continue;
			const credit = columns.credit !== -1 ? cellAmount(row[columns.credit] ?? null) : Math.max(cellAmount(row[columns.amount] ?? null), 0);
			const debit = columns.debit !== -1 ? cellAmount(row[columns.debit] ?? null) : Math.max(-cellAmount(row[columns.amount] ?? null), 0);
			if (credit <= 0 && debit <= 0) continue;
			if (!from || date < from) from = date;
			if (!to || date > to) to = date;
			if (credit <= 0) continue;
			const text = columns.text.map((index) => String(row[index] ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
			lines.push({
				date,
				amount: Math.round(credit * 100) / 100,
				text
			});
		}
		if (lines.length === 0) continue;
		const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= 45 * 864e5;
		const stated = statedDates(sheet.rows.slice(0, head));
		const start = stated.filter((day) => day < from && near(day, from)).sort()[0] || from;
		const end = stated.filter((day) => day > to && near(day, to)).sort().pop() || to;
		return {
			lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
			from: start,
			to: end
		};
	}
	return null;
}
const COMPANY_WORDS = /* @__PURE__ */ new Set([
	"shpk",
	"sha",
	"llc",
	"ltd",
	"gmbh",
	"srl",
	"doo",
	"inc",
	"the",
	"dhe",
	"and",
	"per",
	"del",
	"von"
]);
function words(text) {
	return plain(text).split(/[^a-z0-9]+/).filter(Boolean);
}
function isoOfInvoice(invoice) {
	const date = parseLooseDate(invoice.date);
	return date ? isoDate(date) : "";
}
/** An invoice number as a pattern that also finds it written 202609/014, 202609 014 or 202609-14. */
function numberPattern(number) {
	const parts = String(number || "").match(/[a-z]+|\d+/gi);
	if (!parts || parts.join("").replace(/\D/g, "").length < 5) return null;
	const body = parts.map((part, index) => /^\d+$/.test(part) && index === parts.length - 1 && parts.length > 1 ? `0*${Number(part)}` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\-/._]{0,3}");
	return new RegExp(`(?<![a-z0-9])${body}(?![0-9])`, "i");
}
/** The digit layout the invoice numbers share (202609-014 → 6 digits, dash, 3 digits), to spot a number of the same kind that is not ours. */
function numberShapes(invoices) {
	const shapes = /* @__PURE__ */ new Set();
	for (const invoice of invoices) {
		const number = String(invoice.number || "").trim();
		if (number.replace(/\D/g, "").length < 5 || !/\d[^\da-z]+\d/i.test(number)) continue;
		shapes.add(number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\d+/g, (digits) => `\\d{${digits.length}}`).replace(/[a-z]+/gi, (letters) => letters));
	}
	return [...shapes].slice(0, 8).map((shape) => new RegExp(`(?<![a-z0-9])${shape}(?![0-9])`, "gi"));
}
/** How many single-character insertions, deletions or replacements turn one text into the other. */
function editDistance(a, b) {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		const current = [i];
		for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		previous = current;
	}
	return previous[b.length];
}
/** The bank's own charge on an international transfer, when the statement states it (":71F:EUR33.00"). */
function statedFee(text) {
	const found = /71F:\s*[A-Z]{3}\s*([\d.,]+)/i.exec(text);
	return found ? cents(cellAmount(found[1])) : 0;
}
/**
* Pairs the statement's incoming payments with the issued invoices, oldest payment first:
* 1. a payment that names invoice numbers settles those invoices;
* 2. what is left of a payment goes to open invoices of the client it names, when the amounts add up exactly;
* 3. a payment naming nobody goes to the one open invoice of exactly that amount.
* A payment a few euros short of an invoice it names is taken as paid in full, the difference being bank charges.
*/
function matchStatement(statement, invoices, options = {}) {
	const issued = invoices.filter((invoice) => invoice.lifecycle !== "draft" && invoice.lifecycle !== "cancelled" && invoice.status !== "cancelled" && cents(invoice.total) > 0);
	const inPeriod = (iso) => Boolean(iso) && iso >= statement.from && iso <= statement.to;
	const entries = issued.map((invoice) => {
		const total = cents(invoice.total);
		const date = isoOfInvoice(invoice);
		const live = activePayments(invoice.payments);
		const checkable = live.filter((payment) => payment.method !== "cash" && inPeriod(cellDate(payment.date)));
		const byHand = live.length === 0 && invoice.status === "paid";
		const recorded = byHand ? inPeriod(date) ? total : 0 : checkable.reduce((sum, payment) => sum + cents(payment.amount), 0);
		const kept = byHand ? total - recorded : live.reduce((sum, payment) => sum + cents(payment.amount), 0) - recorded;
		const start = Math.max(total - kept, 0);
		return {
			invoice,
			total,
			date,
			live,
			checkable,
			recorded,
			kept,
			start,
			open: start,
			pattern: numberPattern(invoice.number),
			payments: [],
			names: []
		};
	});
	const shapes = numberShapes(issued);
	const lineWords = statement.lines.map((line) => new Set(words(line.text)));
	const frequency = /* @__PURE__ */ new Map();
	for (const set of lineWords) for (const word of set) frequency.set(word, (frequency.get(word) || 0) + 1);
	const common = (word) => (frequency.get(word) || 0) > Math.max(statement.lines.length * .15, 8);
	for (const entry of entries) {
		const all = words(entry.invoice.client?.fullName || "").filter((word) => !COMPANY_WORDS.has(word) && !/^\d+$/.test(word));
		const long = all.filter((word) => word.length >= 4 && !common(word));
		entry.names = long.length > 0 ? long : all.filter((word) => word.length === 3 && !common(word));
	}
	const namesClient = (entry, set) => entry.names.some((name) => {
		if (set.has(name)) return true;
		for (const word of set) if (word.length >= 5 && name.length > word.length && name.startsWith(word)) return true;
		return false;
	});
	const clientKey = (entry) => entry.invoice.clientId || entry.invoice.client?.id || plain(entry.invoice.client?.fullName);
	const ownNumbers = new Set(entries.map((entry) => plain(entry.invoice.number)));
	const monthOf = (number) => /^(20\d{2}(?:0[1-9]|1[0-2]))\D/.exec(String(number || ""))?.[1];
	const months = new Set(entries.map((entry) => monthOf(entry.invoice.number)).filter(Boolean));
	const byMonth = entries.length > 0 && entries.filter((entry) => monthOf(entry.invoice.number)).length >= entries.length * .8;
	const loose = [];
	const leftovers = [];
	const settled = [];
	const namedIn = statement.lines.map((line) => entries.filter((entry) => entry.pattern && entry.pattern.test(line.text)));
	statement.lines.map((line, index) => ({
		line,
		index,
		stray: namedIn[index].some((entry) => !namesClient(entry, lineWords[index])) && entries.some((entry) => namesClient(entry, lineWords[index]))
	})).sort((a, b) => Number(a.stray) - Number(b.stray) || a.line.date.localeCompare(b.line.date)).forEach(({ line, index }) => {
		let rest = cents(line.amount) + statedFee(line.text);
		const set = lineWords[index];
		let named = namedIn[index];
		const sumOpen = (list) => list.reduce((sum, entry) => sum + entry.open, 0);
		if (named.length > 1 && Math.abs(sumOpen(named) - rest) > 5) {
			const own = named.filter((entry) => namesClient(entry, set));
			if (own.length > 0 && own.length < named.length) named = own;
		}
		if (entries.some((entry) => namesClient(entry, set))) named = named.filter((entry) => namesClient(entry, set) || entry.open > 0 && entry.open <= rest + Math.max(entry.open * .03, 5));
		const foreign = shapes.some((shape) => (line.text.match(shape) || []).some((found) => !ownNumbers.has(plain(found)))) || byMonth && [...line.text.matchAll(/(?<![0-9])(20\d{2}(?:0[1-9]|1[0-2]))(?![0-9])/g)].some((found) => !months.has(found[1]));
		const before = new Map(named.map((entry) => [entry, entry.open]));
		named.sort((a, b) => a.date.localeCompare(b.date)).forEach((entry, position) => {
			if (entry.open <= 0 || rest <= 0) return;
			const last = position === named.length - 1;
			const short = entry.open - rest;
			const paid = short <= 0 || last && short <= Math.min(5e3, Math.max(entry.open * .03, 5)) ? entry.open : rest;
			entry.payments.push({
				date: line.date,
				amount: paid / 100,
				basis: "number"
			});
			entry.open -= paid;
			rest -= Math.min(paid, rest);
		});
		const paidTo = new Set(named.filter((entry) => entry.open < (before.get(entry) ?? 0)).map(clientKey));
		if (paidTo.size > 0) settled.push({
			set,
			clients: paidTo
		});
		if (rest > 5) leftovers.push({
			line,
			set,
			rest,
			payers: new Set(named.map(clientKey)),
			foreign
		});
	});
	leftovers.sort((a, b) => a.line.date.localeCompare(b.line.date));
	const codeClients = /* @__PURE__ */ new Map();
	const codeLines = /* @__PURE__ */ new Map();
	const invoiceHeads = new Set(entries.map((entry) => plain(entry.invoice.number).split(/\D+/)[0]));
	for (const { set, clients } of settled) for (const word of set) {
		if (word.length < 6 || !/\d/.test(word) || common(word) || invoiceHeads.has(word) || /^20\d{2}(0[1-9]|1[0-2])?$/.test(word)) continue;
		const seen = codeClients.get(word) || /* @__PURE__ */ new Set();
		for (const client of clients) seen.add(client);
		codeClients.set(word, seen);
		if (clients.size === 1) codeLines.set(word, (codeLines.get(word) || 0) + 1);
	}
	const codes = /* @__PURE__ */ new Map();
	for (const [word, clients] of codeClients) if (clients.size === 1 && (codeLines.get(word) || 0) >= 2) codes.set(word, [...clients][0]);
	const identifies = (entry, set) => namesClient(entry, set) || [...set].some((word) => codes.get(word) === clientKey(entry));
	for (const left of [...leftovers]) {
		const written = [...left.line.text.matchAll(/(?<![a-z0-9])(\d{4,8})[\s\-/._]{0,3}(\d{1,3})(?![0-9])/gi)].map((found) => ({
			head: found[1],
			seq: String(Number(found[2]))
		}));
		if (written.length === 0) continue;
		const near = entries.filter((entry) => {
			if (entry.open <= 0 || !entry.date || entry.date > left.line.date || Math.abs(entry.open - left.rest) > 5) return false;
			const parts = String(entry.invoice.number || "").match(/^(\d{4,8})\D{1,3}(\d{1,4})$/);
			if (!parts) return false;
			const seq = String(Number(parts[2]));
			return written.some((item) => editDistance(item.head, parts[1]) + editDistance(item.seq, seq) === 1);
		});
		if (near.length !== 1) continue;
		near[0].payments.push({
			date: left.line.date,
			amount: near[0].open / 100,
			basis: "amount"
		});
		near[0].open = 0;
		leftovers.splice(leftovers.indexOf(left), 1);
	}
	const payersOf = (left) => {
		const pool = left.foreign && left.payers.size === 0 ? [] : entries.filter((entry) => entry.open > 0 && entry.date && entry.date <= left.line.date && (left.payers.has(clientKey(entry)) || identifies(entry, left.set)));
		const byClient = /* @__PURE__ */ new Map();
		for (const entry of pool) byClient.set(clientKey(entry), [...byClient.get(clientKey(entry)) || [], entry]);
		for (const group of byClient.values()) group.sort((a, b) => a.date.localeCompare(b.date));
		return byClient;
	};
	/** Pays the oldest set of one payer's open invoices that adds up to the transfer exactly; false if none does. */
	const exactFit = (left) => {
		let best = null;
		const newest = (list) => list[list.length - 1].date;
		for (const group of payersOf(left).values()) {
			const candidates = group.slice(0, 14);
			for (let mask = 1; mask < 1 << candidates.length; mask += 1) {
				const chosen = candidates.filter((_, bit) => mask & 1 << bit);
				if (Math.abs(chosen.reduce((sum, entry) => sum + entry.open, 0) - left.rest) > 5) continue;
				if (!best || newest(chosen) < newest(best) || newest(chosen) === newest(best) && chosen.length < best.length) best = chosen;
			}
		}
		if (!best) return false;
		for (const entry of best) {
			entry.payments.push({
				date: left.line.date,
				amount: entry.open / 100,
				basis: "amount"
			});
			entry.open = 0;
		}
		return true;
	};
	/**
	* A transfer from one known payer that fits no set of its invoices exactly is a payment on account:
	* it goes to that payer's oldest open invoices first, and what is left belongs to no invoice here.
	* False when the payer is not known, or not alone.
	*/
	const onAccountFit = (left) => {
		const byClient = payersOf(left);
		if (byClient.size !== 1) return false;
		let rest = left.rest;
		for (const entry of [...byClient.values()][0]) {
			if (rest <= 5) break;
			const paid = entry.open - rest <= Math.min(5e3, Math.max(entry.open * .03, 5)) ? entry.open : rest;
			entry.payments.push({
				date: left.line.date,
				amount: paid / 100,
				basis: "amount"
			});
			entry.open -= paid;
			rest -= Math.min(paid, rest);
		}
		if (rest > 5) loose.push({
			...left.line,
			rest: Math.min(rest, cents(left.line.amount)) / 100
		});
		return true;
	};
	const unexplained = [];
	for (const day of [...new Set(leftovers.map((left) => left.line.date))].sort()) {
		const notExact = leftovers.filter((left) => left.line.date === day).filter((left) => !exactFit(left));
		for (const left of notExact) if (!onAccountFit(left)) unexplained.push(left);
	}
	for (const left of unexplained) {
		const fits = left.foreign || left.payers.size > 0 ? [] : entries.filter((entry) => entry.open > 0 && entry.date && entry.date <= left.line.date && Math.abs(entry.open - left.rest) <= 5 && entry.open === entry.start);
		const clients = new Set(fits.map(clientKey));
		const mentionsOther = entries.some((entry) => identifies(entry, left.set));
		if (fits.length > 0 && clients.size === 1 && !mentionsOther) {
			const entry = fits.sort((a, b) => a.date.localeCompare(b.date))[0];
			entry.payments.push({
				date: left.line.date,
				amount: entry.open / 100,
				basis: "amount"
			});
			entry.open = 0;
		} else loose.push({
			...left.line,
			rest: Math.min(left.rest, cents(left.line.amount)) / 100
		});
	}
	return {
		statement,
		verdicts: entries.map((entry) => {
			const bankPaid = entry.start - entry.open;
			const basis = entry.payments.some((payment) => payment.basis === "amount") ? "amount" : "number";
			let change = "none";
			if (bankPaid !== entry.recorded) if (bankPaid + entry.kept >= entry.total) change = "paid";
			else change = bankPaid + entry.kept > 0 ? "partial" : "unpaid";
			else if (bankPaid > 0 && options.dates) {
				if (!(entry.checkable.length === entry.payments.length && entry.payments.every((payment) => entry.checkable.some((row) => cellDate(row.date) === payment.date && cents(row.amount) === cents(payment.amount))))) change = "dates";
			}
			return {
				invoice: entry.invoice,
				payments: entry.payments,
				bankPaid: bankPaid / 100,
				recorded: entry.recorded / 100,
				kept: entry.kept / 100,
				change,
				basis,
				replaces: change === "none" ? [] : entry.checkable.map((payment) => payment.id)
			};
		}),
		loose
	};
}
/** What to send the server for the verdicts the user kept ticked. Dates go out as DD.MM.YYYY. */
function reconcilePayload(verdicts) {
	const local = (iso) => {
		const [year, month, day] = iso.split("-");
		return `${day}.${month}.${year}`;
	};
	return verdicts.filter((verdict) => verdict.change !== "none").map((verdict) => ({
		id: verdict.invoice.id,
		void: verdict.replaces,
		add: verdict.payments.map((payment) => ({
			amount: payment.amount,
			date: local(payment.date)
		}))
	}));
}
//#endregion
//#region src/lib/serverFinance.ts
/** Splits comma-, semicolon- or tab-separated text into rows, honouring quoted cells. */
function readCsv(text) {
	const source = text.replace(/^﻿/, "");
	const firstLine = source.split(/\r?\n/, 1)[0] || "";
	const separator = [
		";",
		",",
		"	"
	].map((mark) => [mark, firstLine.split(mark).length]).sort((a, b) => b[1] - a[1])[0][0];
	const rows = [];
	let row = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		if (quoted) if (char === "\"" && source[i + 1] === "\"") {
			cell += "\"";
			i += 1;
		} else if (char === "\"") quoted = false;
		else cell += char;
		else if (char === "\"" && cell === "") quoted = true;
		else if (char === separator) {
			row.push(cell);
			cell = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[i + 1] === "\n") i += 1;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += char;
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return { sheets: [{
		name: "CSV",
		rows
	}] };
}
/** Reads a spreadsheet in whichever form it came: .xlsx, the older .xls, or CSV text. */
async function readAnyWorkbook(bytes, name = "") {
	if (isLegacyWorkbook(bytes)) return readLegacyWorkbook(bytes);
	if (bytes[0] === 80 && bytes[1] === 75) return readWorkbook(bytes.slice().buffer);
	if (!/\.(csv|txt|tsv)$/i.test(name) && bytes.includes(0)) throw new Error("NOT_SPREADSHEET");
	return readCsv(new TextDecoder("utf-8").decode(bytes));
}
function cellText(value) {
	if (value === null || value === void 0) return "";
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return "";
		return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
	}
	if (typeof value === "number") return String(Math.round(value * 1e4) / 1e4);
	return String(value).replace(/\s+/g, " ").trim();
}
/**
* The workbook as plain text, one row per line and the cells separated by " | ", for reading by
* the language model. Very long sheets keep their beginning and their end, where the totals are.
*/
function workbookText(workbook, maxChars = 6e4) {
	const parts = [];
	const share = Math.max(4e3, Math.floor(maxChars / Math.max(1, workbook.sheets.length)));
	for (const sheet of workbook.sheets) {
		const lines = sheet.rows.map((row) => {
			const cells = row.map(cellText);
			while (cells.length && !cells[cells.length - 1]) cells.pop();
			return cells.join(" | ");
		}).filter((line) => line.replace(/[|\s]/g, ""));
		let body = lines.join("\n");
		if (body.length > share) {
			const head = [];
			const tail = [];
			let used = 0;
			for (const line of lines) {
				if (used + line.length > share * .6) break;
				head.push(line);
				used += line.length + 1;
			}
			for (let i = lines.length - 1; i >= head.length; i -= 1) {
				if (used + lines[i].length > share) break;
				tail.unshift(lines[i]);
				used += lines[i].length + 1;
			}
			body = `${head.join("\n")}\n… (${lines.length - head.length - tail.length} rows left out) …\n${tail.join("\n")}`;
		}
		parts.push(`## Sheet: ${sheet.name}\n${body}`);
	}
	return parts.join("\n\n").slice(0, maxChars);
}
/** The incoming payments of a statement file, or null when the file holds no statement. */
async function statementFromFile(bytes, name = "") {
	try {
		return readStatement(await readAnyWorkbook(bytes, name));
	} catch {
		return null;
	}
}
//#endregion
exports.matchStatement = matchStatement;
exports.readAnyWorkbook = readAnyWorkbook;
exports.readCsv = readCsv;
exports.readStatement = readStatement;
exports.reconcilePayload = reconcilePayload;
exports.statementFromFile = statementFromFile;
exports.workbookText = workbookText;
