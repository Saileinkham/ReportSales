import { useState } from 'react'
import * as XLSX from 'xlsx'
import { ref, set, remove } from 'firebase/database'
import { db } from '../firebase'
import { fmt } from '../utils'

const MONTH_TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const THAI_HOLIDAYS = new Set([
  '2024-01-01','2024-02-24','2024-04-06','2024-04-12','2024-04-13','2024-04-14','2024-04-15',
  '2024-05-01','2024-05-04','2024-05-06','2024-05-10','2024-06-03','2024-07-20','2024-07-22',
  '2024-07-28','2024-08-12','2024-10-13','2024-10-23','2024-12-05','2024-12-10','2024-12-31',
  '2025-01-01','2025-02-12','2025-04-06','2025-04-07','2025-04-13','2025-04-14','2025-04-15',
  '2025-05-01','2025-05-05','2025-05-12','2025-06-03','2025-07-10','2025-07-11',
  '2025-07-28','2025-08-12','2025-10-13','2025-10-23','2025-12-05','2025-12-10','2025-12-31',
  '2026-01-01','2026-03-03','2026-04-06','2026-04-13','2026-04-14','2026-04-15',
  '2026-05-01','2026-05-05','2026-06-01','2026-06-03',
  '2026-07-28','2026-08-12','2026-10-13','2026-10-23','2026-12-05','2026-12-10','2026-12-31',
])

// Count weekday / weekend / holiday days in a yyyy-mm
function countDayTypes(ym) {
  const [y, m] = ym.split('-').map(Number)
  const days = new Date(y, m, 0).getDate() // days in month
  let wd = 0, we = 0, ph = 0
  for (let d = 1; d <= days; d++) {
    const dt  = `${ym}-${String(d).padStart(2,'0')}`
    const dow = new Date(y, m-1, d).getDay()
    if (THAI_HOLIDAYS.has(dt))        ph++
    else if (dow === 0 || dow === 6)  we++
    else                              wd++
  }
  return { wd, we, ph, total: days }
}

// Distribute monthly total by weighted day type:
//   วันธรรมดา = weight 40, เสาร์-อาทิตย์ = weight 60, วันหยุดนักขัต = weight 72 (60×1.2)
function distributeTarget(total, ym) {
  const { wd, we, ph } = countDayTypes(ym)
  const WD = 40, WE = 60, PH = 72
  const totalWeight = wd * WD + we * WE + ph * PH
  const base = totalWeight > 0 ? total / totalWeight : 0
  const wdPerDay = base * WD
  const wePerDay = base * WE
  const phPerDay = base * PH
  return {
    total:    Math.round(total),
    wdDays:   wd,   weDays: we,   phDays: ph,
    wdPerDay: Math.round(wdPerDay),
    wePerDay: Math.round(wePerDay),
    phPerDay: Math.round(phPerDay),
    wdTotal:  Math.round(wdPerDay * wd),
    weTotal:  Math.round(wePerDay * we),
    phTotal:  Math.round(phPerDay * ph),
  }
}

const card  = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 16 }
const inp   = { padding: '8px 12px', background: '#0a0f1a', border: '1px solid #374151', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const sel   = { padding: '8px 12px', background: '#0a0f1a', border: '1px solid #374151', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }
const lbl   = { fontSize: 11, color: '#6b7280', marginBottom: 5, display: 'block' }

function toYM(s) {
  s = String(s || '').trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const [mo, y] = s.split('/'); return `${y}-${mo.padStart(2,'0')}`
  }
  return ''
}

function exportTemplate(allShops, shopMap) {
  const now = new Date()
  const rows = []
  // Header description row
  rows.push({
    'Month': 'yyyy-mm',
    'Shop Code': 'รหัสสาขา (หรือ all สำหรับรวมทุกสาขา)',
    'Target': 'เป้ายอดขายรวมทั้งเดือน (บาท)',
  })
  // Example rows — current + next 2 months
  for (let i = 0; i < 3; i++) {
    const d  = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    // Overall
    rows.push({ 'Month': ym, 'Shop Code': 'all', 'Target': 0 })
    // Per shop
    allShops.forEach(sc => {
      rows.push({ 'Month': ym, 'Shop Code': sc, 'Target': 0 })
    })
  }

  // Second sheet: day type breakdown preview
  const breakdown = []
  for (let i = 0; i < 3; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const ym  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const cnt = countDayTypes(ym)
    breakdown.push({
      'Month': ym,
      'วันทำงาน (จ-ศ)': cnt.wd,
      'เสาร์-อาทิตย์': cnt.we,
      'วันหยุดนักขัตฤกษ์': cnt.ph,
      'รวมวัน': cnt.total,
      'หมายเหตุ': 'ระบบจะแบ่งเป้าเท่ากันทุกวัน',
    })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows),      'Target Template')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(breakdown), 'Day Count Reference')
  XLSX.writeFile(wb, 'Target_Template.xlsx')
}

export default function Target({ targets, allShops, shopMap }) {
  const now = new Date()
  const [selYear,       setSelYear]       = useState(String(now.getFullYear()))
  const [selMonth,      setSelMonth]      = useState(String(now.getMonth()+1).padStart(2,'0'))
  const [shopTargets,   setShopTargets]   = useState({})
  const [overallTarget, setOverallTarget] = useState('')
  const [saving,        setSaving]        = useState(false)
  const [msg,           setMsg]           = useState('')
  const [xlMsg,         setXlMsg]         = useState('')

  const ym       = `${selYear}-${selMonth}`
  const existing = targets?.[ym] || {}
  const years    = []
  for (let y = now.getFullYear()-1; y <= now.getFullYear()+2; y++) years.push(String(y))

  // Preview breakdown for selected month
  const previewTotal = parseFloat(String(overallTarget||0).replace(/,/g,'')) || 0
  const preview      = previewTotal > 0 ? distributeTarget(previewTotal, ym) : null

  // Build save data with distribution
  const buildData = (entries) => {
    const data = {}
    entries.forEach(([sc, rawVal]) => {
      const total = parseFloat(String(rawVal).replace(/,/g,'')) || 0
      if (!total) return
      const ymKey = typeof sc === 'object' ? sc.ym : ym
      const dist  = distributeTarget(total, ymKey || ym)
      data[sc] = dist
    })
    return data
  }

  const handleSave = async () => {
    setSaving(true); setMsg('')
    const entries = []
    if (overallTarget) entries.push(['all', overallTarget])
    allShops.forEach(sc => { if (shopTargets[sc]) entries.push([sc, shopTargets[sc]]) })
    if (!entries.length) { setMsg('กรุณากรอก target อย่างน้อย 1 รายการ'); setSaving(false); return }
    const data = {}
    entries.forEach(([sc, rawVal]) => {
      const total = parseFloat(String(rawVal).replace(/,/g,'')) || 0
      if (total) data[sc] = distributeTarget(total, ym)
    })
    try {
      await set(ref(db, `targets/${ym}`), data)
      setMsg('✅ บันทึกสำเร็จ!'); setShopTargets({}); setOverallTarget('')
    } catch(e) { setMsg('❌ ' + e.message) }
    setSaving(false)
  }

  const handleDelete = async (ymKey) => {
    if (!confirm(`ลบ target ${ymKey}?`)) return
    await remove(ref(db, `targets/${ymKey}`))
  }

  const handleXlsx = async (file) => {
    if (!file) return; setXlMsg('')
    try {
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' })
      const batched = {}
      rows.forEach(r => {
        const sc  = String(r['Shop Code'] || r['สาขา'] || 'all').trim()
        const ym2 = toYM(r['Month'] || r['เดือน'] || '')
        const val = parseFloat(String(r['Target'] || r['เป้า'] || '0').replace(/,/g,'')) || 0
        if (ym2 && val > 0 && sc !== 'รหัสสาขา (หรือ all สำหรับรวมทุกสาขา)') {
          if (!batched[ym2]) batched[ym2] = {}
          batched[ym2][sc] = val
        }
      })
      const entries = Object.entries(batched)
      if (!entries.length) { setXlMsg('❌ ไม่พบข้อมูล — ตรวจสอบคอลัมน์ Month, Shop Code, Target'); return }
      for (const [ymKey, shopData] of entries) {
        const data = {}
        Object.entries(shopData).forEach(([sc, val]) => {
          data[sc] = distributeTarget(val, ymKey)
        })
        await set(ref(db, `targets/${ymKey}`), data)
      }
      setXlMsg(`✅ บันทึก target ${entries.length} เดือนสำเร็จ`)
    } catch(e) { setXlMsg('❌ ' + e.message) }
  }

  const allTargetEntries = Object.entries(targets || {}).sort((a,b) => b[0] > a[0] ? 1 : -1)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>🎯 ตั้งเป้ายอดขาย</h2>
        <button onClick={() => exportTemplate(allShops, shopMap)}
          style={{ background: '#065f46', border: '1px solid #10b98160', color: '#10b981', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          ⬇️ Export Template
        </button>
      </div>

      {/* Manual input */}
      <div style={card}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#f1f5f9' }}>กรอก Target รายเดือน (เป้ารวม 1 ก้อน/สาขา)</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <div><span style={lbl}>ปี</span>
            <select value={selYear} onChange={e => setSelYear(e.target.value)} style={sel}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div><span style={lbl}>เดือน</span>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={sel}>
              {Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m => (
                <option key={m} value={m}>{MONTH_TH[parseInt(m)]}</option>
              ))}
            </select>
          </div>
          {/* Day count info */}
          {(() => { const c = countDayTypes(ym); return (
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: '8px 14px', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ color: '#38bdf8' }}>จ-ศ {c.wd} วัน</span>
              <span style={{ color: '#fb923c' }}>ส-อ {c.we} วัน</span>
              <span style={{ color: '#f472b6' }}>นักขัต {c.ph} วัน</span>
              <span style={{ color: '#6b7280' }}>รวม {c.total} วัน</span>
            </div>
          )})()}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={lbl}>🏢 รวมทุกสาขา (overall)</span>
            <input type="text"
              placeholder={existing['all'] ? `ปัจจุบัน: ฿${fmt(existing['all']?.total ?? existing['all'])}` : 'เป้ารวม'}
              value={overallTarget}
              onChange={e => setOverallTarget(e.target.value)}
              style={inp}
            />
          </div>
          {allShops.map(sc => (
            <div key={sc}>
              <span style={lbl}>{sc}{shopMap?.[sc] ? ` — ${shopMap[sc]}` : ''}</span>
              <input type="text"
                placeholder={existing[sc] ? `ปัจจุบัน: ฿${fmt(existing[sc]?.total ?? existing[sc])}` : 'เป้าสาขา'}
                value={shopTargets[sc] || ''}
                onChange={e => setShopTargets(p => ({...p, [sc]: e.target.value}))}
                style={inp}
              />
            </div>
          ))}
        </div>

        {/* Preview breakdown */}
        {preview && (
          <div style={{ background: '#0a0f1a', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>📊 การกระจายเป้า (ธรรมดา:เสาร์-อาทิตย์:นักขัต = 40:60:72)</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: `วันธรรมดา (${preview.wdDays} วัน × ฿${fmt(preview.wdPerDay)}/วัน)`, val: preview.wdTotal, color: '#38bdf8' },
                { label: `เสาร์-อาทิตย์ (${preview.weDays} วัน × ฿${fmt(preview.wePerDay)}/วัน)`, val: preview.weTotal, color: '#fb923c' },
                { label: `วันหยุดนักขัต (${preview.phDays} วัน × ฿${fmt(preview.phPerDay)}/วัน)`, val: preview.phTotal, color: '#f472b6' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: '#111827', borderRadius: 6, padding: '8px 12px' }}>
                  <p style={{ fontSize: 10, color: '#6b7280' }}>{label}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color }}>฿{fmt(val)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && <p style={{ fontSize: 13, color: msg.startsWith('✅') ? '#10b981' : '#f87171', marginBottom: 12 }}>{msg}</p>}
        <button onClick={handleSave} disabled={saving}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? '⏳ บันทึก...' : '💾 บันทึก Target'}
        </button>
      </div>

      {/* Excel upload */}
      <div style={card}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: '#f1f5f9' }}>📤 อัพโหลด Target จาก Excel</p>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          คอลัมน์:{' '}
          <code style={{ background: '#1f2937', padding: '1px 6px', borderRadius: 4 }}>Month</code> (yyyy-mm) |{' '}
          <code style={{ background: '#1f2937', padding: '1px 6px', borderRadius: 4 }}>Shop Code</code> |{' '}
          <code style={{ background: '#1f2937', padding: '1px 6px', borderRadius: 4 }}>Target</code> — ระบบจะกระจายอัตโนมัติ
        </p>
        <input type="file" accept=".xlsx,.xls" onChange={e => handleXlsx(e.target.files[0])}
          style={{ fontSize: 13, color: '#d1d5db' }} />
        {xlMsg && <p style={{ fontSize: 13, color: xlMsg.startsWith('✅') ? '#10b981' : '#f87171', marginTop: 10 }}>{xlMsg}</p>}
      </div>

      {/* Existing targets */}
      {allTargetEntries.length > 0 && (
        <div style={card}>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#f1f5f9' }}>📋 Target ที่ตั้งไว้</p>
          {allTargetEntries.map(([ymKey, data]) => {
            const [y, m] = ymKey.split('-')
            return (
              <div key={ymKey} style={{ background: '#0a0f1a', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontWeight: 700, color: '#3b82f6', fontSize: 15 }}>{MONTH_TH[parseInt(m)]} {y}</p>
                  <button onClick={() => handleDelete(ymKey)}
                    style={{ background: '#7f1d1d', border: 'none', color: '#f87171', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ลบ
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Object.entries(data).map(([sc, val]) => {
                    const t = typeof val === 'object' ? val : { total: val }
                    return (
                      <div key={sc} style={{ background: '#111827', borderRadius: 8, padding: '8px 12px', minWidth: 160 }}>
                        <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{sc === 'all' ? 'รวมทุกสาขา' : sc}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>฿{fmt(t.total || t)}</p>
                        {t.wdTotal !== undefined && (
                          <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                            <span style={{ color: '#38bdf8' }}>ธรรมดา ฿{fmt(t.wdTotal)}</span>
                            <span style={{ color: '#fb923c' }}>ส-อ ฿{fmt(t.weTotal)}</span>
                            {t.phTotal > 0 && <span style={{ color: '#f472b6' }}>นักขัต ฿{fmt(t.phTotal)}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
