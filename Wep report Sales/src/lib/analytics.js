export function applyDashboardFilters(rows, filters) {
  if (!filters?.length) return rows
  return rows.filter((r) => {
    for (const f of filters) {
      if (!f?.field) continue
      if (!f?.values?.length) continue
      if (!f.values.includes(String(r?.[f.field] ?? ''))) return false
    }
    return true
  })
}

export function aggregateKpi(rows, { agg, field }) {
  if (!rows?.length) return 0
  if (agg === 'count') return rows.length

  const nums = rows
    .map((r) => r?.[field])
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isFinite(n))

  if (!nums.length) return 0
  if (agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length
  return nums.reduce((a, b) => a + b, 0)
}

export function groupAggregate(rows, { dimensionField, measureField, agg, limit, sort }) {
  const map = new Map()
  for (const r of rows) {
    const keyRaw = r?.[dimensionField]
    const key = keyRaw === null || keyRaw === undefined || keyRaw === '' ? '(ว่าง)' : String(keyRaw)
    const existing = map.get(key) ?? { key, count: 0, sum: 0 }
    existing.count += 1
    const v = r?.[measureField]
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) existing.sum += n
    map.set(key, existing)
  }

  let items = [...map.values()].map((x) => ({
    name: x.key,
    value: agg === 'count' ? x.count : agg === 'avg' ? (x.count ? x.sum / x.count : 0) : x.sum,
  }))

  if (sort === 'asc') items.sort((a, b) => a.value - b.value)
  if (sort === 'desc') items.sort((a, b) => b.value - a.value)
  if (limit && Number.isFinite(limit)) items = items.slice(0, limit)

  return items
}

export function formatNumber(value, format) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '0'
  if (format === 'currency') return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

export function dateLabel(isoOrValue) {
  if (!isoOrValue) return '(ว่าง)'
  const d = new Date(isoOrValue)
  if (Number.isNaN(d.getTime())) return String(isoOrValue)
  return d.toISOString().slice(0, 10)
}
