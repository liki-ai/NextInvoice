const { getFinance, saveFinance } = require('../store');

// The hours the team logged, by month, project and person, with the pay each row stands for: the
// web app reads them from the timesheet workbook and the Projects page compares them with what the
// project's client was invoiced. Kept with the finance records, since the pay is for managers only.

const ENTRIES_MAX = 20000;
const PROJECTS_MAX = 2000;
const NAME_MAX = 120;
const BANK_RULES_MAX = 20;
const CLIENTS_MAX = 50;
const SOURCES_MAX = 50;

function timesheetError(code) {
  const err = new Error(code);
  err.financeCode = code;
  return err;
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

function cleanNumber(value, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) return undefined;
  return Math.round(number * 100) / 100;
}

function blank() {
  return { fileName: '', importedAt: null, importedBy: null, months: [], entries: [], projects: {}, sources: {} };
}

function load(ownerId) {
  const saved = (getFinance(ownerId) || {}).timesheet;
  if (!saved) return blank();
  return {
    ...blank(),
    ...saved,
    months: Array.isArray(saved.months) ? saved.months : [],
    entries: Array.isArray(saved.entries) ? saved.entries : [],
    projects: saved.projects && typeof saved.projects === 'object' ? saved.projects : {},
    sources: saved.sources && typeof saved.sources === 'object' ? saved.sources : {},
  };
}

function save(ownerId, timesheet) {
  const finance = getFinance(ownerId) || {};
  saveFinance(ownerId, { ...finance, timesheet });
}

function describe(ownerId) {
  return { timesheet: load(ownerId) };
}

/** Replaces the hours with the ones read from a new workbook; what is said about each project stays. */
function importHours(ownerId, account, body) {
  const rows = Array.isArray(body.entries) ? body.entries : null;
  if (!rows || rows.length === 0 || rows.length > ENTRIES_MAX) throw timesheetError('TIMESHEET_EMPTY');
  const entries = [];
  for (const row of rows) {
    const month = String((row && row.month) || '');
    const project = cleanName(row && row.project);
    const person = cleanName(row && row.person);
    const hours = cleanNumber(row && row.hours, 1000);
    const pay = cleanNumber(row && row.pay, 1000000);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !project || !person || hours === null || hours === undefined || pay === undefined) {
      throw timesheetError('TIMESHEET_ROW');
    }
    entries.push({ month, project, person, hours, pay });
  }
  const current = load(ownerId);
  const timesheet = {
    ...current,
    fileName: cleanName(body.fileName),
    importedAt: new Date().toISOString(),
    importedBy: account.email || null,
    months: [...new Set(entries.map((entry) => entry.month))].sort(),
    entries,
  };
  save(ownerId, timesheet);
  return describe(ownerId);
}

function bankWords(value) {
  const list = (Array.isArray(value) ? value : []).map((item) => String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter((item) => item.length >= 3);
  return [...new Set(list)].slice(0, BANK_RULES_MAX);
}

/** Which client a project is for, or that it is the company's own work. */
function setProject(ownerId, body) {
  const name = cleanName(body.project);
  if (!name) throw timesheetError('TIMESHEET_PROJECT');
  const timesheet = load(ownerId);
  const next = { ...(timesheet.projects[name] || {}) };
  if (body.clientId !== undefined) next.clientId = body.clientId ? String(body.clientId).slice(0, 100) : null;
  if (body.internal !== undefined) next.internal = Boolean(body.internal);
  if (next.internal) next.clientId = null;
  // Words of a bank payment that mark money for this project without an invoice (a transfer from
  // the product's own account abroad, say).
  if (body.bank !== undefined) next.bank = bankWords(body.bank);
  // Other clients whose invoices and payments count for this project (a laboratory using a product).
  if (body.clients !== undefined) {
    const list = (Array.isArray(body.clients) ? body.clients : []).map((item) => String(item ?? '').slice(0, 100)).filter(Boolean);
    next.clients = [...new Set(list)].slice(0, CLIENTS_MAX);
  }
  const projects = { ...timesheet.projects, [name]: next };
  if (Object.keys(projects).length > PROJECTS_MAX) throw timesheetError('TIMESHEET_PROJECT');
  save(ownerId, { ...timesheet, projects });
  return describe(ownerId);
}

/**
 * Money that comes in outside the projects (a state subsidy, a grant), named by the user and
 * recognised in the bank by its words. No words left removes the source.
 */
function setSource(ownerId, body) {
  const name = cleanName(body.name);
  if (!name) throw timesheetError('TIMESHEET_PROJECT');
  const timesheet = load(ownerId);
  const sources = { ...timesheet.sources };
  const words = bankWords(body.bank);
  if (words.length) sources[name] = words;
  else delete sources[name];
  if (Object.keys(sources).length > SOURCES_MAX) throw timesheetError('TIMESHEET_PROJECT');
  save(ownerId, { ...timesheet, sources });
  return describe(ownerId);
}

function clearHours(ownerId) {
  const timesheet = load(ownerId);
  save(ownerId, { ...blank(), projects: timesheet.projects, sources: timesheet.sources });
  return describe(ownerId);
}

module.exports = { describe, importHours, setProject, setSource, clearHours };
