import * as XLSX from 'xlsx'

function normalizeValue(v) {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') {
    const s = v.trim()
    return s === '' ? null : s
  }
  return v
}

export async function parseExcelFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }).map((r) => {
    const out = {}
    for (const [k, v] of Object.entries(r)) out[String(k)] = normalizeValue(v)
    return out
  })
  const columns = rows.length ? Object.keys(rows[0]) : []
  return { rows, columns, meta: { fileName: file.name, sheetName } }
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"'
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

export function parseDelimitedText(text) {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) return { rows: [], columns: [], meta: {} }

  const isTsv = lines[0].includes('\t')
  const parseLine = isTsv ? (l) => l.split('\t') : splitCsvLine
  const header = parseLine(lines[0]).map((h) => h.trim()).filter(Boolean)
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const row = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = normalizeValue(cells[i])
    return row
  })
  return { rows, columns: header, meta: { source: isTsv ? 'tsv' : 'csv' } }
}

export function inferColumnType(rows, field) {
  let num = 0
  let date = 0
  let str = 0
  const sample = rows.slice(0, 200)
  for (const r of sample) {
    const v = r?.[field]
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'number') {
      num++
      continue
    }
    if (v instanceof Date) {
      date++
      continue
    }
    const s = String(v).trim()
    const asNum = Number(s.replace(/,/g, ''))
    if (!Number.isNaN(asNum) && s !== '') {
      num++
      continue
    }
    const asDate = new Date(s)
    if (!Number.isNaN(asDate.getTime()) && /\d/.test(s)) {
      date++
      continue
    }
    str++
  }
  if (num >= date && num >= str) return 'number'
  if (date >= num && date >= str) return 'date'
  return 'string'
}

export function coerceValue(type, v) {
  if (v === null || v === undefined || v === '') return null
  if (type === 'number') {
    if (typeof v === 'number') return v
    const s = String(v).trim().replace(/,/g, '')
    const n = Number(s)
    return Number.isNaN(n) ? null : n
  }
  if (type === 'date') {
    if (v instanceof Date) return v.toISOString()
    const d = new Date(String(v).trim())
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return String(v)
}

export function normalizeRowsWithSchema(rows, schema) {
  return rows.map((r) => {
    const out = {}
    for (const col of schema) {
      if (col.hidden) continue
      out[col.field] = coerceValue(col.type, r?.[col.field])
    }
    return out
  })
}
