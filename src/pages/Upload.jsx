import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { ref, set, update } from 'firebase/database'
import { db } from '../firebase'
import { COL_MAP, toYMD, fmt } from '../utils'

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

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
        const records = raw
          .filter(r => r['Shop Code'] && String(r['Shop Code']).trim())
          .map(r => {
            const rec = {}
            for (const [excelCol, field] of Object.entries(COL_MAP)) {
              const v = r[excelCol]
              if (field === 'dt') {
                rec[field] = toYMD(v)
              } else if (['bc','cc','qt'].includes(field)) {
                rec[field] = parseInt(String(v).replace(/,/g, '')) || 0
              } else if (['bs','gs','dc','vt','nt','sv'].includes(field)) {
                rec[field] = parseFloat(String(v).replace(/,/g, '')) || 0
              } else {
                rec[field] = String(v || '').trim()
              }
            }
            return rec
          })
          .filter(r => r.dt && r.sc)
        resolve(records)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function Upload({ onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const [records, setRecords]   = useState(null)
  const [filename, setFilename] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)
  const fileRef = useRef()

  const handleFile = async file => {
    if (!file) return
    setError(''); setDone(false); setRecords(null)
    setFilename(file.name)
    try {
      const recs = await parseExcel(file)
      if (!recs.length) { setError('ไม่พบข้อมูลในไฟล์'); return }
      setRecords(recs)
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
    if (!records || !db) return
    setUploading(true)
    try {
      const batchId = `batch_${Date.now()}`
      const dates = records.map(r => r.dt).filter(Boolean).sort()
      const shops = [...new Set(records.map(r => r.sc))]
      const modes = [...new Set(records.map(r => r.mo))]
      const shopMap = {}
      records.forEach(r => { if (r.sc && r.sn) shopMap[r.sc] = r.sn })

      const meta = {
        filename,
        uploadedAt: new Date().toISOString(),
        recordCount: records.length,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        shops: shops.join(','),
        modes: modes.join(','),
        shopMap: JSON.stringify(shopMap),
      }

      await set(ref(db, `tx_batches/${batchId}/meta`), meta)

      // Build all chunks then write in parallel (max 5 concurrent) for speed
      // Strip sn (in shopMap already) and empty strings to minimize Firebase size
      const slim = records.map(r => {
        const out = {}
        for (const [k, v] of Object.entries(r)) {
          if (k === 'sn') continue  // stored in shopMap meta
          if (v === '') continue    // skip empty strings only (keep 0 — it's a valid value)
          out[k] = v
        }
        return out
      })

      const CHUNK = 5000
      const total = slim.length
      const chunks = []
      for (let i = 0; i < total; i += CHUNK) {
        const chunk = {}
        for (let j = i; j < Math.min(i + CHUNK, total); j++) chunk[j] = slim[j]
        chunks.push(chunk)
      }
      setUploadProgress(`กำลังบันทึก ${total.toLocaleString()} รายการ...`)
      const CONCURRENCY = 5
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        await Promise.all(
          chunks.slice(i, i + CONCURRENCY).map(c => update(ref(db, `tx_batches/${batchId}/data`), c))
        )
        const done = Math.min((i + CONCURRENCY) * CHUNK, total)
        setUploadProgress(`บันทึกแล้ว ${done.toLocaleString()} / ${total.toLocaleString()} รายการ`)
      }

      setDone(true)
      setRecords(null)
      setFilename('')
      setUploadProgress('')
      setTimeout(() => onUploaded?.(), 1200)
    } catch (err) {
      setError('บันทึกข้อมูลล้มเหลว: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const stats = records ? (() => {
    const dates = [...new Set(records.map(r => r.dt))].sort()
    const shops = [...new Set(records.map(r => r.sc))]
    const modes = [...new Set(records.map(r => r.mo))]
    const totalBS = records.reduce((s, r) => s + (r.bs || 0), 0)
    return { dates, shops, modes, totalBS }
  })() : null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>อัพโหลดไฟล์ Transaction</h2>

      {!records && !done && (
        <div
          style={{ ...S.zone, ...(dragging ? S.zoneHover : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
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
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>กำลังไปหน้ารายงาน...</p>
        </div>
      )}

      {records && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div style={S.card}>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>ตรวจสอบข้อมูลก่อนบันทึก</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                ['📄 ไฟล์', filename],
                ['📝 รายการ', `${records.length.toLocaleString()} รายการ`],
                ['📅 วันที่', `${stats.dates[0]} → ${stats.dates[stats.dates.length-1]}`],
                ['🏪 สาขา', `${stats.shops.length} สาขา`],
                ['📦 ช่องทาง', `${stats.modes.length} ช่องทาง`],
                ['💰 Base Sales', `฿${fmt(stats.totalBS)}`],
              ].map(([l, v]) => (
                <div key={l} style={{ background: '#0a0f1a', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{v}</p>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>สาขา:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {stats.shops.map(s => <span key={s} style={S.tag('#3b82f6')}>{s}</span>)}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>ช่องทางขาย:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {stats.modes.map(m => <span key={m} style={S.tag('#10b981')}>{m}</span>)}
              </div>
            </div>
          </div>

          <div style={S.card}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>ตัวอย่างข้อมูล (8 แถวแรก)</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Shop','วันที่','ช่องทาง','ช่วงเวลา','บิล','ลูกค้า','Qty','Base Sales','Discount'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #1f2937', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '6px 10px', color: '#d1d5db' }}>{r.sc}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{r.dt}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db' }}>{r.mo}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{r.pd}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db', textAlign: 'right' }}>{r.bc}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db', textAlign: 'right' }}>{r.cc}</td>
                      <td style={{ padding: '6px 10px', color: '#d1d5db', textAlign: 'right' }}>{r.qt}</td>
                      <td style={{ padding: '6px 10px', color: '#10b981', textAlign: 'right', fontWeight: 600 }}>{fmt(r.bs)}</td>
                      <td style={{ padding: '6px 10px', color: '#f59e0b', textAlign: 'right' }}>{fmt(r.dc)}</td>
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
            <button onClick={() => { setRecords(null); setFilename(''); setError('') }}
              style={{ ...S.btn('#374151'), flex: 'none', width: 100 }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
