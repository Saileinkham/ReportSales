const DATASETS_KEY = 'reportSale.datasets.v1'
const DASHBOARDS_KEY = 'reportSale.dashboards.v1'

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function loadDatasets() {
  return safeJsonParse(localStorage.getItem(DATASETS_KEY), [])
}

export function saveDatasets(datasets) {
  localStorage.setItem(DATASETS_KEY, JSON.stringify(datasets))
}

export function loadDashboards() {
  return safeJsonParse(localStorage.getItem(DASHBOARDS_KEY), [])
}

export function saveDashboards(dashboards) {
  localStorage.setItem(DASHBOARDS_KEY, JSON.stringify(dashboards))
}

export function upsertById(list, item) {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx === -1) return [...list, item]
  const copy = [...list]
  copy[idx] = item
  return copy
}

export function removeById(list, id) {
  return list.filter((x) => x.id !== id)
}
