import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { ref, set, update } from 'firebase/database'
import { db } from '../firebase'

const S = {
  zone: {
    border: '2px dashed #374151', borderRadius: 12, padding: '48px 24px',
    textAlign: 'center', cursor: 'pointer', transition: 'all .2s',
    background: '#111827',
  },
  zoneHover: {
    border: '2px dashed #3b82f6', background: '#1e3a5f',
  },
  btn: (color = '#3b82f6') => ({
    background: color, color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'opacity .15s',
  }),
  card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 },
  tag: (color) => ({
    background: color + '22', color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
  }),
}

function parseExcelRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
        const columns = Object.keys(raw[0] || {})
        const rows = raw.filter(r => Object.values(r).some(v => String(v).trim()))
        resolve({ rows, columns })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Try to detect a date column and find its range
function detectDateRange(rows, columns) {
  const dateColCandidates = columns.filter(c => /date|วันที่|dt|day/i.test(c))
  for (const col of dateColCandidates) {
    const vals = rows.map(r => r[col]).filter(Boolean)
    if (vals.length > 0) {
      const sorted = [...vals].sort()
      return { col, from: sorted[0], to: sorted[sorted.length - 1] }
    }
  }
  return null
}

export default function ItemUpload({ onUploaded }) {
  const [dragging, setDragging]         = useState(false)
  const [rows, setRows]                 = useState(null)
  const [columns, setColumns]           = useState([])
  const [filename, setFilename]         = useState('')
  const [uploading, setUploading]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError]               = useState('')
  const [done, setDone]                 = useState(false)
  const fileRef = useRef()

  const handleFile = async file => {
    if (!file) return
    setError(''); setDone(false); setRows(null); setColumns([])
    setFilename(file.name)
    try {
      const { rows: r, columns: cols } = await parseExcelRaw(file)
      if (!r.length) { setError('ไม่พบข้อมูลในไฟล์'); return }
      setRows(r)
      setColumns(cols)
    } catch {
      setError('อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบรูปแบบ Excel')
    }
  }

  const handleDrop = e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const doUpload = async () => {
    if (!rows || !db) return
    setUploading(true)
    try {
      const batchId = `item_batch_${Date.now()}`
      const dateRange = detectDateRange(rows, columns)

      const meta = {
        filename,
        uploadedAt: new Date().toISOString(),
        recordCount: rows.length,
        columns: columns.join(','),
        ...(dateRange ? { dateCol: dateRange.col, dateFrom: dateRange.from, dateTo: dateRange.to } : {}),
      }

      await set(ref(db, `item_batches/${batchId}/meta`), meta)

      // Build all chunks then write in parallel (max 5 concurrent) for speed
      const CHUNK = 5000
      const total = rows.length
      const chunks = []
      for (let i = 0; i < total; i += CHUNK) {
        const chunk = {}
        for (let j = i; j < Math.min(i + CHUNK, total); j++) chunk[j] = rows[j]
        chunks.push(chunk)
      }
      setUploadProgress(`กำลังบันทึก ${total.toLocaleString()} รายการ...`)
      const CONCURRENCY = 5
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        await Promise.all(
          chunks.slice(i, i + CONCURRENCY).map(c => update(ref(db, `item_batches/${batchId}/data`), c))
        )
        const saved = Math.min((i + CONCURRENCY) * CHUNK, total)
        setUploadProgress(`บันทึกแล้ว ${saved.toLocaleString()} / ${total.toLocaleString()} รายการ`)
      }

      setDone(true)
      setRows(null)
      setColumns([])
      setFilename('')
      setUploadProgress('')
      setTimeout(() => onUploaded?.(), 1200)
    } catch (err) {
      setError('บันทึกข้อมูลล้มเหลว: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const dateRange = rows && columns.length ? detectDateRange(rows, columns) : null
  const previewCols = columns.slice(0, 8)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>นำเข้ารายการขาย</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        อัพโหลดไฟล์ Excel รายการขาย (Item Detail) — ระบบจะเก็บทุกคอลัมน์ตามที่มีในไฟล์
      </p>

      {!records && !done && (
        <div
          style={{ ...S.zone, ...(dragging ? S.zoneHover : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>ลากไฟล์ Excel มาวางที่นี่</p>
          <p style={{ fontSize: 13, color: '#6b7280' }}>หรือคลิกเพื่อเลือกไฟล์ (.xlsx, .xls)</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {error && (
        <div style={{ background: '#7f1d1d', border: '1px solid #ef444444', borderRadius: 8, padding: '12px 16px', marginTop: 16, color: '#fca5a5', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {done && (
        <div style={{ background: '#052e16', border: '1px solid #22c55e44', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>อัพโหลดสำเร็จ!</p>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>กำลังไปหน้าจัดการ...</p>
        </div>
      )}

      {rows && columns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div style={S.card}>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>ตรวจสอบข้อมูลก่อนบันทึก</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                ['📄 ไฟล์', filename],
                ['📝 รายการ', `${rows.length.toLocaleString()} รายการ`],
                ['📊 คอลัมน์', `${columns.length} คอลัมน์`],
                ...(dateRange ? [
                  ['📅 ตั้งแต่', dateRange.from],
                  ['📅 ถึง', dateRange.to],
                ] : []),
              ].map(([l, v]) => (
                <div key={l} style={{ background: '#0a0f1a', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>คอลัมน์ที่พบ:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {columns.map(c => <span key={c} style={S.tag('#3b82f6')}>{c}</span>)}
              </div>
            </div>
          </div>

          <div style={S.card}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>ตัวอย่างข้อมูล (8 แถวแรก)</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {previewCols.map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #1f2937', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                    {columns.length > 8 && (
                      <th style={{ padding: '6px 10px', color: '#4b5563', fontWeight: 600, borderBottom: '1px solid #1f2937' }}>+{columns.length - 8} คอลัมน์</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                      {previewCols.map(c => (
                        <td key={c} style={{ padding: '6px 10px', color: '#d1d5db', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {String(r[c] ?? '')}
                        </td>
                      ))}
                      {columns.length > 8 && <td style={{ padding: '6px 10px', color: '#4b5563' }}>...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={doUpload} disabled={uploading}
              style={{ ...S.btn(), opacity: uploading ? 0.6 : 1, flex: 1 }}>
              {uploading ? `⏳ ${uploadProgress || 'กำลังเริ่ม...'}` : '☁️ บันทึกลง Firebase'}
            </button>
            <button onClick={() => { setRows(null); setColumns([]); setFilename(''); setError('') }}
              style={{ ...S.btn('#374151'), flex: 'none', width: 100 }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
