import { useMemo, useState } from 'react'
import Modal from '../components/Modal.jsx'
import { inferColumnType, normalizeRowsWithSchema, parseDelimitedText, parseExcelFile } from '../lib/importers.js'
import { createId } from '../lib/id.js'

function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('th-TH')
}

export default function DataSourcesPage({ datasets, onUpsertDataset, onDeleteDataset }) {
  const [importState, setImportState] = useState(null)
  const [datasetName, setDatasetName] = useState('')
  const [schema, setSchema] = useState([])

  const previewRows = useMemo(() => importState?.rows?.slice(0, 8) || [], [importState])

  async function handleFile(file) {
    if (!file) return
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const payload = JSON.parse(await file.text())
        if (payload?.rows && payload?.columns && payload?.name) {
          const now = new Date().toISOString()
          onUpsertDataset({
            ...payload,
            id: String(payload.id ?? createId()),
            updatedAt: now,
          })
          return
        }
        alert('ไฟล์ JSON นี้ไม่ใช่ Dataset ที่รองรับ')
      } catch {
        alert('อ่านไฟล์ JSON ไม่ได้')
      }
      return
    }
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      const parsed = parseDelimitedText(text)
      openImport(parsed.rows, parsed.columns, { sourceLabel: file.name })
      return
    }
    const parsed = await parseExcelFile(file)
    openImport(parsed.rows, parsed.columns, { sourceLabel: `${parsed.meta.fileName} (${parsed.meta.sheetName})` })
  }

  async function handlePaste() {
    const text = await navigator.clipboard.readText()
    const parsed = parseDelimitedText(text)
    openImport(parsed.rows, parsed.columns, { sourceLabel: 'Clipboard' })
  }

  function openImport(rows, columns, meta) {
    setImportState({ rows, columns, meta })
    setDatasetName(meta?.sourceLabel || 'ชุดข้อมูลใหม่')
    setSchema(
      columns.map((c) => ({
        field: c,
        label: c,
        type: inferColumnType(rows, c),
        hidden: false,
      })),
    )
  }

  function closeImport() {
    setImportState(null)
    setDatasetName('')
    setSchema([])
  }

  function confirmImport() {
    if (!importState) return
    const name = datasetName.trim()
    if (!name) return

    const normalizedRows = normalizeRowsWithSchema(importState.rows, schema)
    const now = new Date().toISOString()
    const dataset = {
      id: createId(),
      name,
      createdAt: now,
      updatedAt: now,
      columns: schema,
      rows: normalizedRows,
      source: importState.meta?.sourceLabel || '',
    }
    onUpsertDataset(dataset)
    closeImport()
  }

  function exportDataset(ds) {
    const payload = JSON.stringify(ds, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ds.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">ข้อมูลนำเข้า (Data Source)</h2>
          <p className="mt-1 text-sm text-gray-500">เพิ่ม/อัปโหลดชุดข้อมูล แล้วกำหนดหัวคอลัมน์และชนิดข้อมูลได้</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePaste}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            วางข้อมูล (Paste)
          </button>
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            นำเข้า Excel/CSV
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">ชุดข้อมูลที่บันทึกไว้</h3>
          <div className="text-sm text-gray-500">{datasets.length} ชุด</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {datasets.map((ds) => (
            <div key={ds.id} className="rounded-lg border bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900">{ds.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    แหล่งที่มา: {ds.source || '-'} · อัปเดต: {formatDateTime(ds.updatedAt)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Rows: {(ds.rows?.length || 0).toLocaleString('th-TH')} · Columns:{' '}
                    {(ds.columns?.filter((c) => !c.hidden).length || 0).toLocaleString('th-TH')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteDataset(ds.id)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  ลบ
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => exportDataset(ds)}
                  className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                >
                  Export JSON
                </button>
              </div>
            </div>
          ))}

          {!datasets.length ? (
            <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-gray-400 md:col-span-2 xl:col-span-3">
              ยังไม่มีชุดข้อมูล ลองนำเข้า Excel/CSV หรือวางข้อมูลจากตาราง Excel
            </div>
          ) : null}
        </div>
      </div>

      {importState ? (
        <Modal
          title={`นำเข้าชุดข้อมูล: ${importState.meta?.sourceLabel || ''}`}
          onClose={closeImport}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeImport}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                บันทึกชุดข้อมูล
              </button>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">ชื่อชุดข้อมูล</label>
                <input
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="เช่น Sales 2026"
                />
              </div>

              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">ตั้งค่าคอลัมน์</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500">{schema.length} คอลัมน์</div>
                    <button
                      type="button"
                      onClick={() =>
                        setSchema((prev) => [
                          ...prev,
                          {
                            field: `custom_${createId()}`,
                            label: `คอลัมน์ใหม่`,
                            type: 'string',
                            hidden: false,
                            custom: true,
                          },
                        ])
                      }
                      className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100 border"
                    >
                      + เพิ่มคอลัมน์
                    </button>
                  </div>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-auto pr-2">
                  {schema.map((col) => (
                    <div key={col.field} className="rounded-lg border bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[140px] text-xs font-semibold text-gray-600">{col.field}</div>
                        <input
                          value={col.label}
                          onChange={(e) =>
                            setSchema((prev) =>
                              prev.map((c) => (c.field === col.field ? { ...c, label: e.target.value } : c)),
                            )
                          }
                          className="flex-1 rounded-md border px-2 py-1 text-sm"
                        />
                        <select
                          value={col.type}
                          onChange={(e) =>
                            setSchema((prev) =>
                              prev.map((c) => (c.field === col.field ? { ...c, type: e.target.value } : c)),
                            )
                          }
                          className="rounded-md border px-2 py-1 text-sm"
                        >
                          <option value="string">ข้อความ</option>
                          <option value="number">ตัวเลข</option>
                          <option value="date">วันที่</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={col.hidden}
                            onChange={(e) =>
                              setSchema((prev) =>
                                prev.map((c) => (c.field === col.field ? { ...c, hidden: e.target.checked } : c)),
                              )
                            }
                          />
                          ซ่อน
                        </label>
                        {col.custom ? (
                          <button
                            type="button"
                            onClick={() => setSchema((prev) => prev.filter((c) => c.field !== col.field))}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            ลบคอลัมน์
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-white p-4">
                <div className="text-sm font-semibold text-gray-800">ตัวอย่างข้อมูล (Preview)</div>
                <div className="mt-3 overflow-auto rounded-lg border">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {importState.columns.slice(0, 12).map((c) => (
                          <th
                            key={c}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {previewRows.map((r, idx) => (
                        <tr key={idx}>
                          {importState.columns.slice(0, 12).map((c) => (
                            <td key={c} className="px-3 py-2 text-gray-700">
                              {r?.[c] === null || r?.[c] === undefined ? '-' : String(r?.[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!previewRows.length ? (
                        <tr>
                          <td colSpan={importState.columns.slice(0, 12).length || 1} className="px-3 py-8 text-center text-gray-400">
                            ไม่มีข้อมูล
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Rows ทั้งหมด: {(importState.rows?.length || 0).toLocaleString('th-TH')}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
