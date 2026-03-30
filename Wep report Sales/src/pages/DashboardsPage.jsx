import { useMemo, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import Modal from '../components/Modal.jsx'
import WidgetRenderer from '../components/WidgetRenderer.jsx'
import { createId } from '../lib/id.js'

const ResponsiveGridLayout = WidthProvider(Responsive)

function defaultWidgetTitle(type) {
  if (type === 'kpi') return 'KPI'
  if (type === 'bar') return 'Bar Chart'
  if (type === 'line') return 'Line Chart'
  if (type === 'table') return 'Table'
  return 'Widget'
}

function makeNewWidget(type) {
  const id = createId()
  const base = { id, type, title: defaultWidgetTitle(type) }
  if (type === 'kpi') return { ...base, config: { agg: 'sum', measureField: '', format: 'currency' } }
  if (type === 'table') return { ...base, config: { fields: [], limit: 50 } }
  return {
    ...base,
    config: { dimensionField: '', measureField: '', agg: 'sum', sort: 'desc', limit: 20 },
  }
}

function makeTemplateDashboard({ datasetId }) {
  const now = new Date().toISOString()
  const widgets = [
    {
      id: createId(),
      type: 'kpi',
      title: 'ยอดขายรวม',
      config: { agg: 'sum', measureField: 'amount', format: 'currency' },
    },
    {
      id: createId(),
      type: 'bar',
      title: 'ยอดขายตามหมวด',
      config: { dimensionField: 'product', measureField: 'amount', agg: 'sum', sort: 'desc', limit: 20 },
    },
    {
      id: createId(),
      type: 'table',
      title: 'ตารางข้อมูล',
      config: { fields: [], limit: 30 },
    },
  ]
  const layout = [
    { i: widgets[0].id, x: 0, y: 0, w: 4, h: 6 },
    { i: widgets[1].id, x: 4, y: 0, w: 8, h: 12 },
    { i: widgets[2].id, x: 0, y: 12, w: 12, h: 14 },
  ]
  return {
    id: createId(),
    name: 'Dashboard ตัวอย่าง',
    datasetId,
    createdAt: now,
    updatedAt: now,
    widgets,
    layout,
  }
}

function ensureLayoutForWidget(layout, widgetId, y = Infinity) {
  if (layout.some((l) => l.i === widgetId)) return layout
  return [...layout, { i: widgetId, x: 0, y, w: 6, h: 8 }]
}

function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('th-TH')
}

export default function DashboardsPage({
  datasets,
  dashboards,
  selectedDashboardId,
  onSelectDashboardId,
  onUpsertDashboard,
  onDeleteDashboard,
}) {
  const [isEditing, setIsEditing] = useState(true)
  const [editingWidgetId, setEditingWidgetId] = useState(null)
  const [widgetDraft, setWidgetDraft] = useState(null)

  const selectedDashboard = dashboards.find((d) => d.id === selectedDashboardId) || null
  const dataset = datasets.find((d) => String(d.id) === String(selectedDashboard?.datasetId)) || null
  const columns = dataset?.columns?.filter((c) => !c.hidden) || []
  const rows = dataset?.rows || []

  const layout = useMemo(() => {
    const base = selectedDashboard?.layout || []
    const widgetIds = selectedDashboard?.widgets?.map((w) => w.id) || []
    let next = base.filter((l) => widgetIds.includes(l.i))
    for (const id of widgetIds) next = ensureLayoutForWidget(next, id)
    return next
  }, [selectedDashboard])

  function createDashboard() {
    const name = prompt('ตั้งชื่อ Dashboard:', 'Sales Dashboard')
    if (!name) return
    const datasetId = datasets[0]?.id || null
    const now = new Date().toISOString()
    const dashboard = {
      id: createId(),
      name,
      datasetId,
      createdAt: now,
      updatedAt: now,
      widgets: [],
      layout: [],
    }
    onUpsertDashboard(dashboard)
    onSelectDashboardId(dashboard.id)
  }

  function createTemplate() {
    const datasetId = datasets[0]?.id || null
    if (!datasetId) {
      alert('ยังไม่มีชุดข้อมูล กรุณาไปหน้า Data Source ก่อน')
      return
    }
    const d = makeTemplateDashboard({ datasetId })
    onUpsertDashboard(d)
    onSelectDashboardId(d.id)
  }

  function updateDashboard(patch) {
    if (!selectedDashboard) return
    onUpsertDashboard({ ...selectedDashboard, ...patch, updatedAt: new Date().toISOString() })
  }

  function addWidget(type) {
    if (!selectedDashboard) return
    const widget = makeNewWidget(type)
    const nextWidgets = [...(selectedDashboard.widgets || []), widget]
    const nextLayout = ensureLayoutForWidget(selectedDashboard.layout || [], widget.id)
    updateDashboard({ widgets: nextWidgets, layout: nextLayout })
    setEditingWidgetId(widget.id)
    setWidgetDraft(JSON.parse(JSON.stringify(widget)))
  }

  function deleteWidget(widgetId) {
    if (!selectedDashboard) return
    const nextWidgets = (selectedDashboard.widgets || []).filter((w) => w.id !== widgetId)
    const nextLayout = (selectedDashboard.layout || []).filter((l) => l.i !== widgetId)
    updateDashboard({ widgets: nextWidgets, layout: nextLayout })
  }

  const widgetById = useMemo(() => {
    const map = new Map()
    for (const w of selectedDashboard?.widgets || []) map.set(w.id, w)
    return map
  }, [selectedDashboard])

  const widgetEditing = editingWidgetId ? widgetById.get(editingWidgetId) : null

  function openWidgetEditor(widgetId) {
    const w = widgetById.get(widgetId)
    if (!w) return
    setEditingWidgetId(widgetId)
    setWidgetDraft(JSON.parse(JSON.stringify(w)))
  }

  function closeWidgetEditor() {
    setEditingWidgetId(null)
    setWidgetDraft(null)
  }

  function commitWidgetDraft() {
    if (!selectedDashboard) return
    if (!widgetDraft) return
    const nextWidgets = (selectedDashboard.widgets || []).map((w) => (w.id === widgetDraft.id ? widgetDraft : w))
    updateDashboard({ widgets: nextWidgets })
    closeWidgetEditor()
  }

  function exportDashboard(d) {
    const payload = JSON.stringify(d, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${d.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importDashboardFile(file) {
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      if (!payload?.name || !payload?.widgets || !payload?.layout) {
        alert('ไฟล์ JSON นี้ไม่ใช่ Dashboard ที่รองรับ')
        return
      }
      const now = new Date().toISOString()
      const dashboard = {
        ...payload,
        id: String(payload.id ?? createId()),
        updatedAt: now,
      }
      onUpsertDashboard(dashboard)
      onSelectDashboardId(dashboard.id)
    } catch {
      alert('อ่านไฟล์ JSON ไม่ได้')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">สร้างหน้าแบบ Power BI: ลากวาง/ปรับขนาด widget และปรับแต่งกราฟได้</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100">
            Import JSON
            <input type="file" accept=".json" className="hidden" onChange={(e) => importDashboardFile(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            onClick={createDashboard}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + สร้าง Dashboard
          </button>
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${isEditing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'}`}
          >
            {isEditing ? 'โหมดแก้ไข: เปิด' : 'โหมดแก้ไข: ปิด'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">รายการ Dashboard</h3>
            <div className="text-sm text-gray-500">{dashboards.length} หน้า</div>
          </div>

          <div className="space-y-2">
            {dashboards.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectDashboardId(d.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectDashboardId(d.id)
                }}
                className={`w-full cursor-pointer rounded-lg border px-3 py-3 text-left hover:bg-gray-50 ${d.id === selectedDashboardId ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{d.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      อัปเดต: {formatDateTime(d.updatedAt)} · Widgets: {(d.widgets?.length || 0).toLocaleString('th-TH')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`ลบ Dashboard "${d.name}" ใช่หรือไม่?`)) onDeleteDashboard(d.id)
                    }}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}

            {!dashboards.length ? (
              <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-gray-400">
                <div>ยังไม่มี Dashboard</div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={createDashboard}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    + สร้าง Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={createTemplate}
                    className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                  >
                    สร้าง Dashboard ตัวอย่าง
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {selectedDashboard ? (
            <div className="mt-5 space-y-3 border-t pt-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Dataset</label>
                <select
                  value={selectedDashboard.datasetId || ''}
                  onChange={(e) => updateDashboard({ datasetId: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">-- เลือกชุดข้อมูล --</option>
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-gray-500">ถ้ายังไม่มีชุดข้อมูล ให้ไปหน้า Data Source ก่อน</div>
              </div>

              <button
                type="button"
                onClick={() => exportDashboard(selectedDashboard)}
                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Export Dashboard JSON
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          {!selectedDashboard ? (
            <div className="flex h-[520px] items-center justify-center text-sm text-gray-400">เลือก Dashboard หรือสร้างใหม่</div>
          ) : !dataset ? (
            <div className="flex h-[520px] items-center justify-center text-sm text-gray-400">
              เลือกชุดข้อมูลสำหรับ Dashboard นี้ก่อน
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{selectedDashboard.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Dataset: {dataset.name} · Rows: {(rows.length || 0).toLocaleString('th-TH')}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {isEditing
                      ? 'โหมดแก้ไขเปิดอยู่: ลากเพื่อย้าย และลากมุมขวาล่างเพื่อปรับขนาด'
                      : 'เปิด “โหมดแก้ไข” เพื่อย้าย/ปรับขนาด widget'}
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addWidget('kpi')}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      + KPI
                    </button>
                    <button
                      type="button"
                      onClick={() => addWidget('bar')}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      + Bar
                    </button>
                    <button
                      type="button"
                      onClick={() => addWidget('line')}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      + Line
                    </button>
                    <button
                      type="button"
                      onClick={() => addWidget('table')}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      + Table
                    </button>
                  </div>
                ) : null}
              </div>

              <ResponsiveGridLayout
                className="layout"
                layouts={{ lg: layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={24}
                compactType="vertical"
                isDraggable={isEditing}
                isResizable={isEditing}
                onLayoutChange={(cur) => updateDashboard({ layout: cur })}
              >
                {(selectedDashboard.widgets || []).map((w) => (
                  <div key={w.id} className="relative overflow-visible rounded-xl border bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2">
                      <div className="truncate text-sm font-semibold text-gray-900">{w.title}</div>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openWidgetEditor(w.id)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWidget(w.id)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            ลบ
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="h-full p-4">
                      <WidgetRenderer widget={w} rows={rows} columns={columns} />
                    </div>
                  </div>
                ))}
              </ResponsiveGridLayout>
            </div>
          )}
        </div>
      </div>

      {widgetEditing && widgetDraft ? (
        <Modal
          title={`ตั้งค่า Widget: ${widgetDraft.title}`}
          onClose={closeWidgetEditor}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeWidgetEditor}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={commitWidgetDraft}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                บันทึก
              </button>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">ชื่อ Widget</label>
                <input
                  value={widgetDraft.title}
                  onChange={(e) => setWidgetDraft((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              {widgetDraft.type === 'kpi' ? (
                <div className="grid gap-3 rounded-xl border bg-gray-50 p-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Aggregation</label>
                    <select
                      value={widgetDraft.config.agg}
                      onChange={(e) =>
                        setWidgetDraft((p) => ({ ...p, config: { ...p.config, agg: e.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="sum">SUM</option>
                      <option value="avg">AVG</option>
                      <option value="count">COUNT</option>
                    </select>
                  </div>
                  {widgetDraft.config.agg !== 'count' ? (
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Measure</label>
                      <select
                        value={widgetDraft.config.measureField}
                        onChange={(e) =>
                          setWidgetDraft((p) => ({ ...p, config: { ...p.config, measureField: e.target.value } }))
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">-- เลือกคอลัมน์ --</option>
                        {columns.map((c) => (
                          <option key={c.field} value={c.field}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div>
                    <label className="text-sm font-semibold text-gray-700">รูปแบบ</label>
                    <select
                      value={widgetDraft.config.format}
                      onChange={(e) =>
                        setWidgetDraft((p) => ({ ...p, config: { ...p.config, format: e.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="currency">สกุลเงิน</option>
                      <option value="number">ตัวเลข</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {widgetDraft.type === 'bar' || widgetDraft.type === 'line' ? (
                <div className="grid gap-3 rounded-xl border bg-gray-50 p-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Dimension</label>
                    <select
                      value={widgetDraft.config.dimensionField}
                      onChange={(e) =>
                        setWidgetDraft((p) => ({ ...p, config: { ...p.config, dimensionField: e.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกคอลัมน์ --</option>
                      {columns.map((c) => (
                        <option key={c.field} value={c.field}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Measure</label>
                    <select
                      value={widgetDraft.config.measureField}
                      onChange={(e) =>
                        setWidgetDraft((p) => ({ ...p, config: { ...p.config, measureField: e.target.value } }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">-- เลือกคอลัมน์ --</option>
                      {columns.map((c) => (
                        <option key={c.field} value={c.field}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Aggregation</label>
                      <select
                        value={widgetDraft.config.agg}
                        onChange={(e) => setWidgetDraft((p) => ({ ...p, config: { ...p.config, agg: e.target.value } }))}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="sum">SUM</option>
                        <option value="avg">AVG</option>
                        <option value="count">COUNT</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Sort</label>
                      <select
                        value={widgetDraft.config.sort}
                        onChange={(e) => setWidgetDraft((p) => ({ ...p, config: { ...p.config, sort: e.target.value } }))}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="desc">มาก → น้อย</option>
                        <option value="asc">น้อย → มาก</option>
                        <option value="none">ไม่เรียง</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Limit</label>
                    <input
                      type="number"
                      value={widgetDraft.config.limit}
                      onChange={(e) =>
                        setWidgetDraft((p) => ({ ...p, config: { ...p.config, limit: Number(e.target.value || 0) } }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {widgetDraft.type === 'table' ? (
                <div className="grid gap-3 rounded-xl border bg-gray-50 p-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">เลือกคอลัมน์</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {columns.map((c) => {
                        const on = widgetDraft.config.fields.includes(c.field)
                        return (
                          <button
                            key={c.field}
                            type="button"
                            onClick={() => {
                              const next = on
                                ? widgetDraft.config.fields.filter((f) => f !== c.field)
                                : [...widgetDraft.config.fields, c.field]
                              setWidgetDraft((p) => ({ ...p, config: { ...p.config, fields: next } }))
                            }}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border'}`}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">ถ้าไม่เลือก ระบบจะแสดงอัตโนมัติบางส่วน</div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">จำนวนแถว</label>
                    <input
                      type="number"
                      value={widgetDraft.config.limit}
                      onChange={(e) => setWidgetDraft((p) => ({ ...p, config: { ...p.config, limit: Number(e.target.value || 0) } }))}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-gray-800">ตัวอย่าง</div>
              <div className="mt-3 h-[420px]">
                <WidgetRenderer widget={widgetDraft} rows={rows} columns={columns} />
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
