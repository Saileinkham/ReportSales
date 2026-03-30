import { useEffect, useMemo, useState } from 'react'
import DataSourcesPage from './pages/DataSourcesPage.jsx'
import DashboardsPage from './pages/DashboardsPage.jsx'
import { inferColumnType, normalizeRowsWithSchema } from './lib/importers.js'
import { loadDashboards, loadDatasets, removeById, saveDashboards, saveDatasets, upsertById } from './lib/storage.js'

function migrateLegacyDatasetsIfAny() {
  const existing = loadDatasets()
  if (existing.length) return existing
  const legacyRaw = localStorage.getItem('savedDatasets')
  if (!legacyRaw) return []

  try {
    const legacy = JSON.parse(legacyRaw)
    if (!Array.isArray(legacy) || !legacy.length) return []
    const migrated = legacy.map((d) => {
      const rows = Array.isArray(d.data) ? d.data : []
      const columns = Array.isArray(d.columns) ? d.columns : (rows[0] ? Object.keys(rows[0]) : [])
      const schema = columns.map((c) => ({
        field: c,
        label: c,
        type: inferColumnType(rows, c),
        hidden: false,
      }))
      const normalizedRows = normalizeRowsWithSchema(rows, schema)
      const iso = d.date ? new Date(d.date).toISOString() : new Date().toISOString()
      return {
        id: String(d.id ?? Date.now()),
        name: d.name || 'Migrated Dataset',
        createdAt: iso,
        updatedAt: iso,
        columns: schema,
        rows: normalizedRows,
        source: 'legacy',
      }
    })
    saveDatasets(migrated)
    return migrated
  } catch {
    return []
  }
}

function makeSampleDataset() {
  const now = new Date()
  const shops = ['BKK01', 'BKK02', 'CNX01', 'HKT01']
  const products = ['สินค้า A', 'สินค้า B', 'สินค้า C', 'สินค้า D']
  const rows = []
  for (let i = 0; i < 240; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 20), 1 + (i % 20))
    rows.push({
      date: d.toISOString(),
      shop: shops[i % shops.length],
      product: products[i % products.length],
      amount: Math.round(500 + Math.random() * 9500),
      bill: Math.round(1 + Math.random() * 3),
      cust: Math.round(1 + Math.random() * 2),
    })
  }

  const schema = [
    { field: 'date', label: 'วันที่', type: 'date', hidden: false },
    { field: 'shop', label: 'สาขา', type: 'string', hidden: false },
    { field: 'product', label: 'สินค้า', type: 'string', hidden: false },
    { field: 'amount', label: 'ยอดขาย', type: 'number', hidden: false },
    { field: 'bill', label: 'Bill', type: 'number', hidden: false },
    { field: 'cust', label: 'Customer', type: 'number', hidden: false },
  ]

  const normalizedRows = normalizeRowsWithSchema(rows, schema)
  const iso = new Date().toISOString()
  return {
    id: 'ds_sample',
    name: 'ตัวอย่างยอดขาย (Sample)',
    createdAt: iso,
    updatedAt: iso,
    columns: schema,
    rows: normalizedRows,
    source: 'sample',
  }
}

function makeSampleDashboard(datasetId) {
  const now = new Date().toISOString()
  const widgets = [
    { id: 'w_kpi_sales', type: 'kpi', title: 'ยอดขายรวม', config: { agg: 'sum', measureField: 'amount', format: 'currency' } },
    { id: 'w_kpi_bill', type: 'kpi', title: 'Bill รวม', config: { agg: 'sum', measureField: 'bill', format: 'number' } },
    { id: 'w_kpi_cust', type: 'kpi', title: 'Customer รวม', config: { agg: 'sum', measureField: 'cust', format: 'number' } },
    { id: 'w_bar_shop', type: 'bar', title: 'ยอดขายตามสาขา', config: { dimensionField: 'shop', measureField: 'amount', agg: 'sum', sort: 'desc', limit: 20 } },
    { id: 'w_line_date', type: 'line', title: 'ยอดขายตามวัน', config: { dimensionField: 'date', measureField: 'amount', agg: 'sum', sort: 'none', limit: 60 } },
    { id: 'w_table', type: 'table', title: 'รายการล่าสุด', config: { fields: ['date', 'shop', 'product', 'amount'], limit: 20 } },
  ]
  const layout = [
    { i: 'w_kpi_sales', x: 0, y: 0, w: 4, h: 6 },
    { i: 'w_kpi_bill', x: 4, y: 0, w: 4, h: 6 },
    { i: 'w_kpi_cust', x: 8, y: 0, w: 4, h: 6 },
    { i: 'w_bar_shop', x: 0, y: 6, w: 6, h: 12 },
    { i: 'w_line_date', x: 6, y: 6, w: 6, h: 12 },
    { i: 'w_table', x: 0, y: 18, w: 12, h: 14 },
  ]
  return {
    id: 'db_sample',
    name: 'Dashboard ตัวอย่าง',
    datasetId,
    createdAt: now,
    updatedAt: now,
    widgets,
    layout,
  }
}

let cachedInitialState = null
function getInitialState() {
  if (cachedInitialState) return cachedInitialState

  let loadedDatasets = migrateLegacyDatasetsIfAny()
  let loadedDashboards = loadDashboards()

  if (!loadedDatasets.length) {
    const sampleDataset = makeSampleDataset()
    loadedDatasets = [sampleDataset]
    saveDatasets(loadedDatasets)
  }

  if (!loadedDashboards.length && loadedDatasets.length) {
    const sampleDashboard = makeSampleDashboard(loadedDatasets[0].id)
    loadedDashboards = [sampleDashboard]
    saveDashboards(loadedDashboards)
  }

  cachedInitialState = {
    datasets: loadedDatasets,
    dashboards: loadedDashboards,
    selectedDashboardId: loadedDashboards[0]?.id || null,
  }
  return cachedInitialState
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [datasets, setDatasets] = useState(() => getInitialState().datasets)
  const [dashboards, setDashboards] = useState(() => getInitialState().dashboards)
  const [selectedDashboardId, setSelectedDashboardId] = useState(() => getInitialState().selectedDashboardId)

  useEffect(() => saveDatasets(datasets), [datasets])
  useEffect(() => saveDashboards(dashboards), [dashboards])

  function upsertDataset(ds) {
    setDatasets((prev) => upsertById(prev, ds))
  }

  function deleteDataset(id) {
    if (!confirm('ต้องการลบชุดข้อมูลนี้ใช่หรือไม่?')) return
    setDatasets((prev) => removeById(prev, id))
  }

  function upsertDashboard(d) {
    setDashboards((prev) => upsertById(prev, d))
  }

  function deleteDashboard(id) {
    setDashboards((prev) => removeById(prev, id))
    setSelectedDashboardId((cur) => (cur === id ? null : cur))
  }

  const pageTitle = useMemo(() => {
    if (activePage === 'data') return 'Data Source'
    return 'Dashboard'
  }, [activePage])

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="flex">
        <aside className="hidden w-72 shrink-0 border-r bg-white md:block">
          <div className="px-6 py-6">
            <div className="text-2xl font-extrabold text-blue-700">Report Sales</div>
            <div className="mt-1 text-sm text-gray-500">Power BI-like Dashboard Builder</div>
          </div>

          <nav className="px-3 pb-6">
            <button
              type="button"
              onClick={() => setActivePage('dashboard')}
              className={`mb-2 w-full rounded-lg px-4 py-3 text-left text-sm font-semibold ${activePage === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActivePage('data')}
              className={`mb-2 w-full rounded-lg px-4 py-3 text-left text-sm font-semibold ${activePage === 'data' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Data Source
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">{pageTitle}</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {activePage === 'dashboard' ? 'ออกแบบ Dashboard' : 'จัดการชุดข้อมูล'}
              </div>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setActivePage('dashboard')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${activePage === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border'}`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setActivePage('data')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${activePage === 'data' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border'}`}
              >
                Data
              </button>
            </div>
          </div>

          {activePage === 'data' ? (
            <DataSourcesPage datasets={datasets} onUpsertDataset={upsertDataset} onDeleteDataset={deleteDataset} />
          ) : (
            <DashboardsPage
              datasets={datasets}
              dashboards={dashboards}
              selectedDashboardId={selectedDashboardId}
              onSelectDashboardId={setSelectedDashboardId}
              onUpsertDashboard={upsertDashboard}
              onDeleteDashboard={deleteDashboard}
            />
          )}
        </main>
      </div>
    </div>
  )
}
