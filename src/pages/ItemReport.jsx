import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import { normDate } from '../utils'

/* ── styles ── */
const S = {
  card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 },
  sel:  { padding: '7px 10px', background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f1f5f9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  tab:  (active) => ({
    background: active ? '#1e3a5f' : 'transparent',
    border: active ? '1px solid #3b82f660' : '1px solid transparent',
    color: active ? '#3b82f6' : '#6b7280',
    padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  }),
  kpi: { background: '#0a0f1a', border: '1px solid #1f2937', borderRadius: 10, padding: '14px 18px' },
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#6366f1']
const MONTH_TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const fmtB = n => (n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const fmtN = n => (n || 0).toLocaleString('th-TH')

/* ── column fields to map ── */
const FIELDS = [
  { key: 'date',     label: 'วันที่',              required: true  },
  { key: 'shop',     label: 'รหัสสาขา',            required: true  },
  { key: 'category', label: 'Category / หมวดหมู่',  required: true  },
  { key: 'amount',   label: 'ยอดขาย (บาท)',        required: true  },
  { key: 'qty',      label: 'จำนวน / Qty',         required: false },
  { key: 'channel',  label: 'ช่องทางขาย',          required: false },
  { key: 'hour',     label: 'ชั่วโมง / Period',    required: false },
  { key: 'item',     label: 'ชื่อสินค้า',          required: false },
]

/* ── Custom Tooltip ── */
function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#9ca3af', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#f1f5f9', fontWeight: 600 }}>
          {p.name}: ฿{fmtB(p.value)}
        </p>
      ))}
    </div>
  )
}

/* ════════════════════════════════ MTD TAB ═════════════════════════════════ */
function MTDTab({ data, selCategory, setSelCategory, categories }) {
  if (!data) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>ไม่มีข้อมูลในช่วงนี้</div>
  )
  const { top10, totalAmt, hourly, catHourly, catsInHour, latestYM } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {[
          ['ยอดขายรวม',      `฿${fmtB(totalAmt)}`,                            '#10b981'],
          ['เดือน',          latestYM,                                          '#3b82f6'],
          ['จำนวน Category', `${data.catCount} รายการ`,                        '#f59e0b'],
          ['Top Category',   top10[0]?.cat || '-',                              '#8b5cf6'],
        ].map(([l, v, c]) => (
          <div key={l} style={S.kpi}>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Top 10 Category */}
      <div style={S.card}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Top 10 Category — ยอดขาย MTD</p>
        {top10.length === 0
          ? <p style={{ color: '#6b7280', fontSize: 13 }}>ไม่มีข้อมูล</p>
          : (
            <ResponsiveContainer width="100%" height={top10.length * 42 + 20}>
              <BarChart
                data={top10}
                layout="vertical"
                margin={{ top: 0, right: 90, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="cat" width={140} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="amt" name="ยอดขาย" radius={[0, 4, 4, 0]}>
                  {top10.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  <LabelList content={({ x, y, width, height, value, index }) => {
                    const pct = top10[index]?.pct ?? 0
                    return (
                      <text x={x + width + 8} y={y + height / 2 + 4} fill="#f1f5f9" fontSize={11} fontWeight={700}>
                        ฿{fmtB(value)} ({pct.toFixed(2)}%)
                      </text>
                    )
                  }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Hourly */}
      {hourly.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>รายการขายตามช่วงเวลา (MTD)</p>
            <select
              value={selCategory}
              onChange={e => setSelCategory(e.target.value)}
              style={{ ...S.sel, fontSize: 12 }}
            >
              <option value="">ทุก Category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {catHourly.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={catHourly} margin={{ top: 24, right: 10, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="hr"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} />
                {catsInHour.slice(0, 5).map((cat, i) => (
                  <Bar key={cat} dataKey={cat} name={cat} fill={COLORS[i % COLORS.length]} stackId="a" radius={i === catsInHour.slice(0,5).length - 1 ? [4,4,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13 }}>ไม่มีข้อมูล — คอลัมน์ชั่วโมง/Period ไม่ได้ตั้งค่า</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════ OVERVIEW TAB ════════════════════════════ */
function OverviewTab({ data }) {
  if (!data || !data.monthly.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>ไม่มีข้อมูล</div>
  )
  const { monthly, top10, totalAmt } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {[
          ['ยอดขายรวม',     `฿${fmtB(totalAmt)}`,               '#10b981'],
          ['จำนวนเดือน',    `${monthly.length} เดือน`,           '#3b82f6'],
          ['Category ทั้งหมด', `${top10.length}+ รายการ`,        '#f59e0b'],
          ['อันดับ 1',      top10[0]?.cat || '-',                 '#8b5cf6'],
        ].map(([l, v, c]) => (
          <div key={l} style={S.kpi}>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div style={S.card}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>ยอดขายรายเดือน (ภาพรวม)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="ym"
              tickFormatter={v => { const [y,m] = v.split('-'); return `${MONTH_TH[+m]} ${(+y+543).toString().slice(-2)}` }}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={v => [`฿${fmtB(v)}`, 'ยอดขาย']}
              labelFormatter={v => { const [y,m] = v.split('-'); return `${MONTH_TH[+m]} ${+y+543}` }}
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            />
            <Bar dataKey="amt" name="ยอดขาย" fill="#3b82f6" radius={[4,4,0,0]}>
              <LabelList content={({ x, y, width, value }) => (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="#f1f5f9" fontSize={10} fontWeight={700}>
                  ฿{fmtB(value)}
                </text>
              )} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 10 Category overall */}
      <div style={S.card}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Top 10 Category — ภาพรวม</p>
        <ResponsiveContainer width="100%" height={top10.length * 42 + 20}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 0, right: 90, left: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="cat" width={140} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Bar dataKey="amt" name="ยอดขาย" radius={[0, 4, 4, 0]}>
              {top10.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              <LabelList content={({ x, y, width, height, value, index }) => {
                const pct = top10[index]?.pct ?? 0
                return (
                  <text x={x + width + 8} y={y + height / 2 + 4} fill="#f1f5f9" fontSize={11} fontWeight={700}>
                    ฿{fmtB(value)} ({pct.toFixed(2)}%)
                  </text>
                )
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ════════════════════════════════ MAIN ════════════════════════════════════ */
export default function ItemReport({ itemBatches, allShops, shopMap }) {
  /* column map — persisted to localStorage */
  const [colMap, setColMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('itemColMap') || '{}') } catch { return {} }
  })
  const [editingMap, setEditingMap] = useState(false)
  const [draftMap,   setDraftMap]   = useState({})

  const [activeTab,    setActiveTab]    = useState('mtd')
  const [selYear,      setSelYear]      = useState('')
  const [selMonth,     setSelMonth]     = useState('')
  const [selShop,      setSelShop]      = useState('')
  const [selChannel,   setSelChannel]   = useState('')
  const [selCategory,  setSelCategory]  = useState('')

  /* all unique columns across all item batches */
  const allColumns = useMemo(() => {
    const cols = new Set()
    Object.values(itemBatches || {}).forEach(b => {
      if (b.meta?.columns) b.meta.columns.split(',').forEach(c => cols.add(c.trim()))
    })
    return [...cols].sort()
  }, [itemBatches])

  /* flatten all item records using colMap */
  const allItems = useMemo(() => {
    if (!colMap.date || !colMap.category || !colMap.amount) return []
    return Object.values(itemBatches || {}).flatMap(b => {
      if (!b.data) return []
      return Object.values(b.data).map(r => ({
        dt:  normDate(String(r[colMap.date]     || '')),
        sc:  String(r[colMap.shop]              || '').trim(),
        cat: String(r[colMap.category]          || '').trim(),
        amt: parseFloat(String(r[colMap.amount] || '0').replace(/,/g, '')) || 0,
        qty: colMap.qty     ? (parseFloat(String(r[colMap.qty]     || '0').replace(/,/g, '')) || 0) : 0,
        ch:  colMap.channel ? String(r[colMap.channel] || '').trim() : '',
        hr:  colMap.hour    ? String(r[colMap.hour]    || '').trim() : '',
      })).filter(r => r.dt && r.cat)
    })
  }, [itemBatches, colMap])

  /* filter option lists */
  const years      = useMemo(() => [...new Set(allItems.map(r => r.dt.slice(0,4)))].sort().reverse(), [allItems])
  const months     = useMemo(() => [...new Set(allItems.map(r => r.dt.slice(5,7)))].sort(), [allItems])
  const channels   = useMemo(() => [...new Set(allItems.map(r => r.ch))].filter(Boolean).sort(), [allItems])
  const categories = useMemo(() => [...new Set(allItems.map(r => r.cat))].filter(Boolean).sort(), [allItems])

  /* base filter (shop + channel — year/month per tab) */
  const baseFiltered = useMemo(() => allItems.filter(r =>
    (!selShop    || r.sc === selShop) &&
    (!selChannel || r.ch === selChannel)
  ), [allItems, selShop, selChannel])

  /* MTD computation */
  const mtdData = useMemo(() => {
    const cur = baseFiltered.filter(r =>
      (!selYear  || r.dt.slice(0,4) === selYear) &&
      (!selMonth || r.dt.slice(5,7) === selMonth)
    )
    if (!cur.length) return null

    const dates    = cur.map(r => r.dt).sort()
    const latestYM = dates[dates.length - 1].slice(0, 7)

    /* top 10 categories */
    const catMap = {}
    cur.forEach(r => {
      if (!catMap[r.cat]) catMap[r.cat] = { cat: r.cat, amt: 0, qty: 0 }
      catMap[r.cat].amt += r.amt
      catMap[r.cat].qty += r.qty
    })
    const totalAmt = cur.reduce((s, r) => s + r.amt, 0)
    const top10 = Object.values(catMap).sort((a,b) => b.amt - a.amt).slice(0, 10)
    top10.forEach(c => { c.pct = totalAmt > 0 ? c.amt / totalAmt * 100 : 0 })

    /* hourly stacked by category (filtered by selCategory) */
    const hourRows = selCategory ? cur.filter(r => r.cat === selCategory) : cur
    const catsInHour = [...new Set(hourRows.map(r => r.cat))].filter(Boolean)
    const catHourMap = {}
    hourRows.forEach(r => {
      if (!r.hr) return
      if (!catHourMap[r.hr]) catHourMap[r.hr] = { hr: r.hr }
      catHourMap[r.hr][r.cat] = (catHourMap[r.hr][r.cat] || 0) + r.amt
    })
    const catHourly = Object.values(catHourMap).sort((a,b) => a.hr.localeCompare(b.hr))

    const hourly = Object.values(
      cur.reduce((m, r) => {
        if (!r.hr) return m
        if (!m[r.hr]) m[r.hr] = { hr: r.hr, amt: 0 }
        m[r.hr].amt += r.amt
        return m
      }, {})
    ).sort((a,b) => a.hr.localeCompare(b.hr))

    return { top10, totalAmt, hourly, catHourly, catsInHour, latestYM, catCount: Object.keys(catMap).length }
  }, [baseFiltered, selYear, selMonth, selCategory])

  /* Overview computation */
  const overviewData = useMemo(() => {
    const period = baseFiltered.filter(r => (!selYear || r.dt.slice(0,4) === selYear))
    const mMap = {}
    period.forEach(r => {
      const ym = r.dt.slice(0, 7)
      if (!mMap[ym]) mMap[ym] = { ym, amt: 0, qty: 0 }
      mMap[ym].amt += r.amt
      mMap[ym].qty += r.qty
    })
    const monthly = Object.values(mMap).sort((a,b) => a.ym.localeCompare(b.ym))

    const catMap = {}
    period.forEach(r => {
      if (!catMap[r.cat]) catMap[r.cat] = { cat: r.cat, amt: 0, qty: 0 }
      catMap[r.cat].amt += r.amt
      catMap[r.cat].qty += r.qty
    })
    const totalAmt = period.reduce((s, r) => s + r.amt, 0)
    const top10 = Object.values(catMap).sort((a,b) => b.amt - a.amt).slice(0, 10)
    top10.forEach(c => { c.pct = totalAmt > 0 ? c.amt / totalAmt * 100 : 0 })

    return { monthly, top10, totalAmt, count: period.length }
  }, [baseFiltered, selYear])

  const isMapped = !!(colMap.date && colMap.category && colMap.amount && colMap.shop)

  const startEdit = () => { setDraftMap({ ...colMap }); setEditingMap(true) }
  const saveMap   = () => {
    localStorage.setItem('itemColMap', JSON.stringify(draftMap))
    setColMap(draftMap)
    setEditingMap(false)
  }

  /* ── empty state ── */
  if (Object.keys(itemBatches || {}).length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <p style={{ color: '#6b7280', fontSize: 15 }}>ยังไม่มีข้อมูลรายการขาย</p>
      <p style={{ color: '#4b5563', fontSize: 13, marginTop: 6 }}>ไปที่ "นำเข้ารายการขาย" เพื่ออัพโหลดไฟล์</p>
    </div>
  )

  return (
    <div>
      {/* ── Column mapper ── */}
      {(!isMapped || editingMap) ? (
        <div style={{ ...S.card, marginBottom: 20, borderColor: '#3b82f644' }}>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#3b82f6' }}>
            ⚙️ {editingMap ? 'แก้ไขการจับคู่คอลัมน์' : 'ตั้งค่าคอลัมน์ก่อนดูรายงาน'}
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            เลือกว่าคอลัมน์ไหนในไฟล์ Excel ตรงกับข้อมูลอะไร &nbsp;(*) = จำเป็น
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                  {f.label}{f.required ? ' *' : ''}
                </label>
                <select
                  value={draftMap[f.key] || ''}
                  onChange={e => setDraftMap(m => ({ ...m, [f.key]: e.target.value }))}
                  style={{ width: '100%', ...S.sel }}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={saveMap}
              disabled={!draftMap.date || !draftMap.category || !draftMap.amount || !draftMap.shop}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!draftMap.date || !draftMap.category || !draftMap.amount || !draftMap.shop) ? 0.5 : 1 }}
            >
              บันทึกการตั้งค่า
            </button>
            {editingMap && (
              <button onClick={() => setEditingMap(false)}
                style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ยกเลิก
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: '#111827', borderRadius: 10, padding: '10px 16px', border: '1px solid #1f2937', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {FIELDS.filter(f => colMap[f.key]).map(f => (
              <span key={f.key} style={{ fontSize: 11, color: '#6b7280' }}>
                {f.label}: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{colMap[f.key]}</span>
              </span>
            ))}
          </div>
          <button onClick={startEdit}
            style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            ⚙️ แก้ไข
          </button>
        </div>
      )}

      {isMapped && !editingMap && (
        <>
          {/* ── Filter bar ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20, background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 14px' }}>
            {[
              ['ปี',       selYear,    setSelYear,    [['','ทั้งหมด'], ...years.map(y=>[y,y])]],
              ['เดือน',   selMonth,   setSelMonth,   [['','ทั้งหมด'], ...months.map(m=>[m,`${MONTH_TH[+m]} (${m})`])]],
              ['สาขา',    selShop,    setSelShop,    [['','ทุกสาขา'], ...allShops.map(s=>[s, shopMap[s] ? `${s} ${shopMap[s]}` : s])]],
              ['ช่องทาง', selChannel, setSelChannel, [['','ทั้งหมด'], ...channels.map(c=>[c,c])]],
            ].map(([lbl, val, setter, opts]) => (
              <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 10, color: '#6b7280' }}>{lbl}</label>
                <select value={val} onChange={e => setter(e.target.value)} style={S.sel}>
                  {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
            {(selYear || selMonth || selShop || selChannel) && (
              <button onClick={() => { setSelYear(''); setSelMonth(''); setSelShop(''); setSelChannel('') }}
                style={{ background: '#374151', border: 'none', color: '#9ca3af', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', alignSelf: 'flex-end' }}>
                ล้าง
              </button>
            )}
          </div>

          {/* ── Tab switcher ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {[['mtd','📅 MTD'],['overview','📊 ภาพรวม']].map(([k,l]) => (
              <button key={k} onClick={() => setActiveTab(k)} style={S.tab(activeTab === k)}>{l}</button>
            ))}
          </div>

          {activeTab === 'mtd' && (
            <MTDTab
              data={mtdData}
              selCategory={selCategory}
              setSelCategory={setSelCategory}
              categories={categories}
            />
          )}
          {activeTab === 'overview' && <OverviewTab data={overviewData} />}
        </>
      )}
    </div>
  )
}
