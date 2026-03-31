import { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, Customized,
} from 'recharts'
import { fmt, fmtInt, fmtDateShort, sortPeriods, getShopColor, getModeColor, SHOP_COLORS, MODE_COLORS, normDate } from '../utils'

// ─── Smart bar label formatter ────────────────────────────────────────────────
function fmtBar(v) {
  if (v == null || isNaN(v)) return ''
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(2)}M`
  if (v >= 100_000)   return `฿${Math.round(v / 1000).toLocaleString('th-TH')}k`
  return `฿${Math.round(v).toLocaleString('th-TH')}`
}
// Y-axis domain with 20% headroom above max so labels don't clip
function barDomain(data, key) {
  const max = Math.max(...data.map(d => d[key] || 0), 0)
  return [0, Math.ceil(max * 1.25)]
}

// ─── Shared styles (use CSS vars so light mode works) ────────────────────────
const card = { background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 20 }
const subTab = (active) => ({
  background: active ? '#1e3a5f' : 'transparent',
  border: active ? '1px solid #3b82f660' : '1px solid transparent',
  color: active ? '#3b82f6' : '#6b7280',
  padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
})
const tooltip = {
  contentStyle: { background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, fontSize: 12, color: 'var(--c-text)' },
  labelStyle: { color: 'var(--c-muted)' },
  itemStyle: { color: 'var(--c-text)' },
}

// ─── KPI Card ─────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = '#3b82f6', icon }) {
  return (
    <div style={{ ...card, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 28, opacity: 0.15 }}>{icon}</div>
      <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6, letterSpacing: .6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)', marginBottom: 16 }}>{children}</p>
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, unit = '฿' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={tooltip.contentStyle}>
      <p style={{ color: 'var(--c-muted)', marginBottom: 6, fontSize: 12 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#f1f5f9', fontWeight: 600 }}>
          {p.name}: {unit}{fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Monthly bar shape: target behind, actual in front, ฿ + % labels ─────
function makeMonthBar(data, lightMode) {
  const textFill = lightMode ? '#1f2937' : '#f1f5f9'
  return (props) => {
    const { x, y, width, height, index } = props
    const d    = data[index] || {}
    const bs   = d.bs  || 0
    const tgt  = d.tgt || 0
    const baseY = y + height          // chart baseline (y=0)
    const tgtH  = bs > 0 && tgt > 0 ? (tgt / bs) * height : 0
    const tgtY  = baseY - tgtH
    // topY = top of the tallest bar (lowest y value)
    const topY  = tgtH > 0 ? Math.min(y, tgtY) : y
    const pct   = tgt > 0 && bs > 0 ? bs / tgt * 100 : null
    const col   = pct === null ? '#10b981' : pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444'
    const pctCol = pct === null ? '#9ca3af' : col
    return (
      <g>
        {tgtH > 0 && <rect x={x} y={tgtY} width={width} height={tgtH} fill="#1e3a5f" rx={4} ry={4} />}
        <rect x={x + 2} y={y} width={Math.max(0, width - 4)} height={height} fill={col} rx={4} ry={4} />
        <text x={x + width / 2} y={topY - 18} textAnchor="middle" fill={textFill} fontSize={11} fontWeight={700}>
          ฿{fmt(bs)}
        </text>
        {pct !== null && (
          <text x={x + width / 2} y={topY - 5} textAnchor="middle" fill={pctCol} fontSize={10} fontWeight={600}>
            {pct.toFixed(1)}%
          </text>
        )}
      </g>
    )
  }
}

// ─── MoM connector lines (bracket + %) between monthly bars ──────────────
function MoMConnectors({ xAxisMap, yAxisMap, chartData }) {
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]
  if (!xAxis?.scale || !yAxis?.scale || !chartData || chartData.length < 2) return null
  const { scale: xScale, bandSize } = xAxis
  const yScale = yAxis.scale
  const bw = bandSize || 40
  return (
    <g>
      {chartData.slice(1).map((d, i) => {
        const prev = chartData[i]
        if (!prev.bs || !d.bs) return null
        const mom = ((d.bs - prev.bs) / prev.bs) * 100
        const color = mom >= 0 ? '#10b981' : '#ef4444'
        const x1 = xScale(prev.label) + bw / 2
        const x2 = xScale(d.label) + bw / 2
        const topPrev = Math.max(prev.bs, prev.tgt || 0)
        const topCurr = Math.max(d.bs, d.tgt || 0)
        const y1 = yScale(topPrev) - 32
        const y2 = yScale(topCurr) - 32
        const bracketTop = Math.min(y1, y2) - 16
        const midX = (x1 + x2) / 2
        return (
          <g key={i}>
            <polyline
              points={`${x1},${y1} ${x1},${bracketTop} ${x2},${bracketTop} ${x2},${y2}`}
              stroke={color} strokeWidth={1.5} fill="none"
            />
            <text x={midX} y={bracketTop - 4} textAnchor="middle"
              fill={color} fontSize={11} fontWeight={700}>
              {mom >= 0 ? '+' : ''}{mom.toFixed(1)}%
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────
function OverviewTab({ records, monthTargets, lightMode }) {
  const totalBS   = records.reduce((s, r) => s + r.bs, 0)
  const totalBills = records.reduce((s, r) => s + r.bc, 0)
  const totalCust = records.reduce((s, r) => s + r.cc, 0)
  const totalQty  = records.reduce((s, r) => s + r.qt, 0)
  const totalDisc = records.reduce((s, r) => s + r.dc, 0)
  const avgBill   = totalBills > 0 ? totalBS / totalBills : 0

  // AVG by day type
  const dayTypeMap = {}
  records.forEach(r => {
    const dow = new Date(r.dt).getDay()
    const isPH = THAI_HOLIDAYS.has(r.dt)
    const isWE = dow === 0 || dow === 6
    const type = isPH ? 'ph' : isWE ? 'we' : 'wd'
    if (!dayTypeMap[r.dt]) dayTypeMap[r.dt] = { bs: 0, type }
    dayTypeMap[r.dt].bs += r.bs
  })
  const dtVals = Object.values(dayTypeMap)
  const avgByType = (t) => {
    const days = dtVals.filter(d => d.type === t)
    return days.length > 0 ? days.reduce((s, d) => s + d.bs, 0) / days.length : 0
  }
  const avgWD = avgByType('wd')
  const avgWE = avgByType('we')
  const avgPH = avgByType('ph')

  // Monthly trend
  const monthlyMap = {}
  records.forEach(r => {
    const ym = r.dt.slice(0, 7)
    if (!monthlyMap[ym]) monthlyMap[ym] = { ym, bs: 0 }
    monthlyMap[ym].bs += r.bs
  })
  const monthlyData = Object.values(monthlyMap)
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map(d => ({ ...d, bs: Math.round(d.bs), tgt: monthTargets?.[d.ym] || 0, label: `${MONTH_TH[+d.ym.slice(5,7)]} ${(+d.ym.slice(0,4)+543).toString().slice(-2)}` }))
  const multiMonth = monthlyData.length > 1

  // Daily trend
  const dailyMap = {}
  records.forEach(r => {
    dailyMap[r.dt] = (dailyMap[r.dt] || 0) + r.bs
  })
  const isSingleMonth = monthlyData.length === 1
  const dailyData = Object.entries(dailyMap)
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([dt, bs]) => ({
      dt: isSingleMonth ? String(+dt.slice(8, 10)) : fmtDateShort(dt),
      bs: Math.round(bs),
    }))

  // Mode breakdown
  const modeMap = {}
  records.forEach(r => {
    modeMap[r.mo] = (modeMap[r.mo] || 0) + r.bs
  })
  const modeData = Object.entries(modeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([mo, bs], i) => ({ mo, bs: Math.round(bs), color: getModeColor(mo, i) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
        <KPI label="ยอดขาย รวม" value={`฿${fmt(totalBS)}`} icon="💰" color="#10b981" sub={`${records.length.toLocaleString()} รายการ`} />
        <KPI label="บิล รวม" value={fmtInt(totalBills)} icon="🧾" color="#3b82f6" sub={`จำนวนลูกค้า ${fmtInt(totalCust)} คน`} />
        <KPI label="Qty รวม" value={fmtInt(totalQty)} icon="📦" color="#8b5cf6" />
        <KPI label="ค่าเฉลี่ย/บิล" value={`฿${fmt(avgBill)}`} icon="📊" color="#f59e0b" />
        <KPI label="ส่วนลดรวม" value={`฿${fmt(totalDisc)}`} icon="🏷️" color="#ef4444" sub={`${totalBS > 0 ? ((totalDisc / (totalBS + totalDisc)) * 100).toFixed(2) : 0}% ของยอดรวม`} />
        <KPI label="AVG วันธรรมดา/วัน" value={avgWD > 0 ? `฿${fmt(avgWD)}` : '—'} icon="📅" color="#38bdf8" />
        <KPI label="AVG เสาร์-อาทิตย์/วัน" value={avgWE > 0 ? `฿${fmt(avgWE)}` : '—'} icon="🌅" color="#fb923c" />
        <KPI label="AVG วันหยุดนักขัตฤกษ์/วัน" value={avgPH > 0 ? `฿${fmt(avgPH)}` : '—'} icon="🎌" color="#f472b6" />
      </div>

      {/* Monthly trend (when multi-month) */}
      {multiMonth && (() => {
        const maxVal = Math.max(...monthlyData.map(d => Math.max(d.bs, d.tgt || 0)), 1)
        const mDomain = [0, Math.ceil(maxVal * 1.55)]
        return (
          <div style={card}>
            <SectionTitle>📊 ยอดขายรายเดือน</SectionTitle>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData} margin={{ top: 70, right: 16, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--c-muted)', fontSize: 11 }} interval={0} />
                <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={fmtBar} domain={mDomain} />
                <Tooltip formatter={(v, name) => [`฿${fmt(v)}`, name]} contentStyle={tooltip.contentStyle} />
                <Bar dataKey="bs" name="ยอดขาย" shape={makeMonthBar(monthlyData, lightMode)} />
                <Customized component={(p) => <MoMConnectors {...p} chartData={monthlyData} />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Daily Trend */}
      <div style={card}>
        <SectionTitle>📈 ยอดขายรายวัน</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={dailyData}>
            <defs>
              <linearGradient id="bsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="dt" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} interval={isSingleMonth ? 0 : 'preserveStartEnd'} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={fmtBar} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="bs" name="ยอดขาย" stroke="#10b981" fill="url(#bsGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Mode pie + bar side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <SectionTitle>🥧 ยอดขาย แยกตามช่องทาง</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={modeData} dataKey="bs" nameKey="mo" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
                {modeData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [`฿${fmt(v)}`, 'ยอดขาย']} contentStyle={tooltip.contentStyle} />
              <Legend formatter={v => <span style={{ fontSize: 11, color: 'var(--c-text2)' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <SectionTitle>📊 ยอดขาย แยกช่องทาง (บาท)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
              <XAxis type="number" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="mo" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="bs" name="ยอดขาย" radius={[0, 4, 4, 0]}>
                {modeData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── By Shop Tab ──────────────────────────────────────────────────────────
function ByShopTab({ records, shopMap }) {
  const shopCodes = [...new Set(records.map(r => r.sc))].sort()

  // Aggregate per shop
  const shopAgg = shopCodes.map((sc, idx) => {
    const recs = records.filter(r => r.sc === sc)
    const bs    = recs.reduce((s, r) => s + r.bs, 0)
    const bills = recs.reduce((s, r) => s + r.bc, 0)
    const cust  = recs.reduce((s, r) => s + r.cc, 0)
    const qty   = recs.reduce((s, r) => s + r.qt, 0)
    const disc  = recs.reduce((s, r) => s + r.dc, 0)
    return { sc, name: shopMap[sc] || sc, bs, bills, cust, qty, disc, color: getShopColor(sc, idx) }
  }).sort((a, b) => b.bs - a.bs)

  // Daily by shop
  const dailyShopMap = {}
  records.forEach(r => {
    if (!dailyShopMap[r.dt]) dailyShopMap[r.dt] = {}
    dailyShopMap[r.dt][r.sc] = (dailyShopMap[r.dt][r.sc] || 0) + r.bs
  })
  const dailyShopData = Object.entries(dailyShopMap)
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([dt, map]) => ({ dt: fmtDateShort(dt), ...map }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Shop KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
        {shopAgg.map(s => (
          <div key={s.sc} style={{ ...card, borderLeft: `3px solid ${s.color}` }}>
            <p style={{ fontSize: 10, color: 'var(--c-muted)', marginBottom: 4 }}>{s.sc}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8, lineHeight: 1.3 }}>{s.name}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: s.color }}>฿{fmt(s.bs)}</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
              {fmtInt(s.bills)} บิล · {fmtInt(s.cust)} คน
            </p>
          </div>
        ))}
      </div>

      {/* Bar comparison */}
      <div style={card}>
        <SectionTitle>🏪 เปรียบเทียบ ยอดขาย แต่ละสาขา</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={shopAgg} margin={{ top: 46, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="sc" tick={{ fill: 'var(--c-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => fmtBar(v)} domain={barDomain(shopAgg, 'bs')} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="bs" name="ยอดขาย" radius={[4, 4, 0, 0]}>
              {shopAgg.map((d, i) => <Cell key={i} fill={d.color} />)}
              <LabelList content={({ x, y, width, value }) => (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" style={{ fill: 'var(--c-text)' }} fontSize={11} fontWeight={700}>
                  {fmtBar(value)}
                </text>
              )} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Multi-line daily trend per shop */}
      <div style={card}>
        <SectionTitle>📈 ยอดขายรายวันแต่ละสาขา</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={dailyShopData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="dt" tick={{ fill: '#6b7280', fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltip.contentStyle} formatter={(v, name) => [`฿${fmt(v)}`, name]} />
            <Legend formatter={v => <span style={{ fontSize: 11, color: 'var(--c-text2)' }}>{v}</span>} />
            {shopCodes.map((sc, i) => (
              <Area key={sc} type="monotone" dataKey={sc} name={shopMap[sc] || sc}
                stroke={getShopColor(sc, i)} fill={getShopColor(sc, i) + '22'} strokeWidth={1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Shop summary table */}
      <div style={card}>
        <SectionTitle>📋 ตารางสรุปรายสาขา</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['สาขา', 'ยอดขาย', 'บิล', 'ลูกค้า', 'Qty', 'Discount', 'เฉลี่ย/บิล'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'สาขา' ? 'left' : 'right', color: 'var(--c-muted)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shopAgg.map(s => (
                <tr key={s.sc} style={{ borderBottom: '1px solid #1f293755' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontWeight: 600, color: s.color }}>{s.sc}</span>
                    <span style={{ color: 'var(--c-muted)', fontSize: 11, marginLeft: 8 }}>{s.name}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(s.bs)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(s.bills)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(s.cust)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(s.qty)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f87171' }}>฿{fmt(s.disc)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                    ฿{fmt(s.bills > 0 ? s.bs / s.bills : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #374151' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--c-text)' }}>รวมทั้งหมด</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: 14 }}>฿{fmt(shopAgg.reduce((s, x) => s + x.bs, 0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>{fmtInt(shopAgg.reduce((s, x) => s + x.bills, 0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>{fmtInt(shopAgg.reduce((s, x) => s + x.cust, 0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>{fmtInt(shopAgg.reduce((s, x) => s + x.qty, 0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f87171', fontWeight: 600 }}>฿{fmt(shopAgg.reduce((s, x) => s + x.disc, 0))}</td>
                <td style={{ padding: '10px 12px' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── By Channel Tab ───────────────────────────────────────────────────────
function ByChannelTab({ records, shopMap }) {
  const modes = [...new Set(records.map(r => r.mo))].sort()
  const shopCodes = [...new Set(records.map(r => r.sc))].sort()

  // Aggregate per mode
  const modeAgg = modes.map((mo, i) => {
    const recs = records.filter(r => r.mo === mo)
    return {
      mo,
      bs:    recs.reduce((s, r) => s + r.bs, 0),
      bills: recs.reduce((s, r) => s + r.bc, 0),
      cust:  recs.reduce((s, r) => s + r.cc, 0),
      disc:  recs.reduce((s, r) => s + r.dc, 0),
      color: getModeColor(mo, i),
    }
  }).sort((a, b) => b.bs - a.bs)

  const totalBS = modeAgg.reduce((s, x) => s + x.bs, 0)

  // Shop × Mode matrix
  const matrix = shopCodes.map(sc => {
    const row = { sc, name: shopMap[sc] || sc }
    modes.forEach(mo => {
      const recs = records.filter(r => r.sc === sc && r.mo === mo)
      row[mo] = recs.reduce((s, r) => s + r.bs, 0)
    })
    row._total = modes.reduce((s, mo) => s + (row[mo] || 0), 0)
    return row
  })

  const maxCell = Math.max(...matrix.flatMap(row => modes.map(mo => row[mo] || 0)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Channel KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
        {modeAgg.map(m => (
          <div key={m.mo} style={{ ...card, borderLeft: `3px solid ${m.color}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: m.color, marginBottom: 6 }}>{m.mo}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>฿{fmt(m.bs)}</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
              {totalBS > 0 ? ((m.bs / totalBS) * 100).toFixed(2) : 0}% · {fmtInt(m.bills)} บิล
            </p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={card}>
        <SectionTitle>📊 ยอดขาย แยกช่องทาง</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={modeAgg} margin={{ top: 46, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="mo" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => fmtBar(v)} domain={barDomain(modeAgg, 'bs')} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="bs" name="ยอดขาย" radius={[4, 4, 0, 0]}>
              {modeAgg.map((d, i) => <Cell key={i} fill={d.color} />)}
              <LabelList content={({ x, y, width, value, index }) => {
                const pct = totalBS > 0 ? (value / totalBS * 100).toFixed(2) : 0
                return (
                  <g>
                    <text x={x + width / 2} y={y - 18} textAnchor="middle" style={{ fill: 'var(--c-text)' }} fontSize={11} fontWeight={700}>
                      {fmtBar(value)}
                    </text>
                    <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={modeAgg[index]?.color || '#9ca3af'} fontSize={10}>
                      {pct}%
                    </text>
                  </g>
                )
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Shop × Mode heatmap table */}
      <div style={card}>
        <SectionTitle>🗂️ ยอดขาย: สาขา × ช่องทาง (Heatmap)</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>สาขา</th>
                {modes.map(mo => (
                  <th key={mo} style={{ padding: '8px 10px', textAlign: 'right', color: getModeColor(mo, 0), fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap', fontSize: 11 }}>{mo}</th>
                ))}
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 700, borderBottom: '1px solid var(--c-border)' }}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(row => (
                <tr key={row.sc} style={{ borderBottom: '1px solid #1f293744' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--c-text2)', whiteSpace: 'nowrap' }}>{row.sc}</td>
                  {modes.map(mo => {
                    const v = row[mo] || 0
                    const intensity = maxCell > 0 ? v / maxCell : 0
                    return (
                      <td key={mo} style={{
                        padding: '8px 10px', textAlign: 'right',
                        background: v > 0 ? `rgba(16,185,129,${intensity * 0.45})` : 'transparent',
                        color: v > 0 ? 'var(--c-text)' : 'var(--c-muted)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {v > 0 ? fmt(v) : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>฿{fmt(row._total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel summary table */}
      <div style={card}>
        <SectionTitle>📋 ตารางสรุปช่องทาง</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['ช่องทาง', 'ยอดขาย', '%', 'บิล', 'ลูกค้า', 'Discount', 'เฉลี่ย/บิล'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'ช่องทาง' ? 'left' : 'right', color: 'var(--c-muted)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modeAgg.map(m => (
                <tr key={m.mo} style={{ borderBottom: '1px solid #1f293755' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: m.color, marginRight: 8 }} />
                    <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{m.mo}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(m.bs)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-muted)' }}>{totalBS > 0 ? ((m.bs / totalBS) * 100).toFixed(2) : 0}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(m.bills)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(m.cust)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f87171' }}>฿{fmt(m.disc)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                    ฿{fmt(m.bills > 0 ? m.bs / m.bills : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── By Time Tab ──────────────────────────────────────────────────────────
function ByTimeTab({ records }) {
  // Hourly distribution
  const periodMap = {}
  records.forEach(r => {
    if (!periodMap[r.pd]) periodMap[r.pd] = { bs: 0, bills: 0 }
    periodMap[r.pd].bs    += r.bs
    periodMap[r.pd].bills += r.bc
  })
  const periods = sortPeriods(Object.keys(periodMap))
  const totalPeriodBS    = Object.values(periodMap).reduce((s, v) => s + v.bs, 0)
  const totalPeriodBills = Object.values(periodMap).reduce((s, v) => s + v.bills, 0)
  const periodData = periods.map(pd => ({
    pd:      pd.split('-')[0],
    bs:      Math.round(periodMap[pd].bs),
    bills:   periodMap[pd].bills,
    bsPct:   totalPeriodBS    > 0 ? (periodMap[pd].bs    / totalPeriodBS    * 100) : 0,
    billPct: totalPeriodBills > 0 ? (periodMap[pd].bills / totalPeriodBills * 100) : 0,
  }))

  // Day of week
  const dowMap = {}
  const dowNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์']
  records.forEach(r => {
    const dow = new Date(r.dt).getDay()
    if (!dowMap[dow]) dowMap[dow] = { bs: 0, bills: 0 }
    dowMap[dow].bs    += r.bs
    dowMap[dow].bills += r.bc
  })
  const dowData = [0,1,2,3,4,5,6].map(d => ({
    day: dowNames[d],
    bs:    Math.round(dowMap[d]?.bs || 0),
    bills: dowMap[d]?.bills || 0,
  }))

  // Week number trend
  const weekMap = {}
  records.forEach(r => {
    const d = new Date(r.dt)
    const startOfYear = new Date(d.getFullYear(), 0, 1)
    const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
    const wk = `W${week}`
    weekMap[wk] = (weekMap[wk] || 0) + r.bs
  })
  const weekData = Object.entries(weekMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([wk, bs]) => ({ wk, bs: Math.round(bs) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hourly distribution */}
      <div style={card}>
        <SectionTitle>⏰ ยอดขาย แยกตามช่วงเวลา (Hourly)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={periodData} margin={{ top: 46, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="pd" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => fmtBar(v)} domain={barDomain(periodData,'bs')} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="bs" name="ยอดขาย" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
              <LabelList content={({ x, y, width, value, index }) => {
                const pct = periodData[index]?.bsPct
                return (
                  <g>
                    <text x={x + width / 2} y={y - 14} textAnchor="middle" style={{ fill: 'var(--c-text)' }} fontSize={10} fontWeight={600}>
                      {fmtBar(value)}
                    </text>
                    <text x={x + width / 2} y={y - 2} textAnchor="middle" fill="#8b5cf6" fontSize={9}>
                      {pct?.toFixed(2)}%
                    </text>
                  </g>
                )
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bill count by hour */}
      <div style={card}>
        <SectionTitle>🧾 จำนวนบิลแยกตามช่วงเวลา</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={periodData} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="pd" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
            <Tooltip contentStyle={tooltip.contentStyle} formatter={(v) => [fmtInt(v), 'บิล']} />
            <Bar dataKey="bills" name="บิล" fill="#3b82f6" radius={[4, 4, 0, 0]}>
              <LabelList content={({ x, y, width, value, index }) => {
                const pct = periodData[index]?.billPct
                return (
                  <g>
                    <text x={x + width / 2} y={y - 14} textAnchor="middle" style={{ fill: 'var(--c-text)' }} fontSize={10} fontWeight={600}>
                      {fmtInt(value)}
                    </text>
                    <text x={x + width / 2} y={y - 2} textAnchor="middle" fill="#3b82f6" fontSize={9}>
                      {pct?.toFixed(2)}%
                    </text>
                  </g>
                )
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Day of week */}
        <div style={card}>
          <SectionTitle>📅 ยอดขาย แยกตามวันในสัปดาห์</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="bs" name="ยอดขาย" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly trend */}
        <div style={card}>
          <SectionTitle>📆 ยอดขาย แยกตามสัปดาห์</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
              <XAxis dataKey="wk" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="bs" name="ยอดขาย" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Peak hours table */}
      <div style={card}>
        <SectionTitle>📋 ตารางช่วงเวลา (เรียงตามเวลา)</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          {(() => {
            const sorted = [...periodData].sort((a, b) => a.pd.localeCompare(b.pd))
            const totalBs = sorted.reduce((s, p) => s + p.bs, 0)
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['ช่วงเวลา', 'ยอดขาย', '%ยอด', 'บิล', '%บิล', 'เฉลี่ย/บิล'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'ช่วงเวลา' ? 'left' : 'right', color: 'var(--c-muted)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(p => {
                    const bsPct   = totalBs > 0 ? p.bs / totalBs * 100 : 0
                    const billPct = p.billPct ?? 0
                    return (
                      <tr key={p.pd} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--c-text2)', fontWeight: 600 }}>{p.pd}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(p.bs)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 6, background: 'var(--c-surface)', borderRadius: 3 }}>
                              <div style={{ width: `${bsPct}%`, height: 6, background: '#8b5cf6', borderRadius: 3 }} />
                            </div>
                            <span style={{ color: '#8b5cf6', fontWeight: 600, minWidth: 38, textAlign: 'right' }}>{bsPct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(p.bills)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-muted)', fontSize: 11 }}>{billPct.toFixed(1)}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b' }}>฿{fmt(p.bills > 0 ? p.bs / p.bills : 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─── Details Tab ──────────────────────────────────────────────────────────
function DetailsTab({ records, shopMap }) {
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const PAGE_SIZE = 50

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r =>
      !q ||
      (r.sc || '').toLowerCase().includes(q) ||
      (r.mo || '').toLowerCase().includes(q) ||
      (r.dt || '').includes(q)
    )
  }, [records, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSearch = v => { setSearch(v); setPage(1) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="ค้นหา shop / ช่องทาง / วันที่..."
          style={{
            flex: 1, minWidth: 200, padding: '9px 14px', background: '#111827',
            border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)',
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <span style={{ color: 'var(--c-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
          {filtered.length.toLocaleString()} รายการ
        </span>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--c-card-inner)' }}>
              {['Shop','วันที่','ช่องทาง','ช่วงเวลา','บิล','ลูกค้า','Qty','ยอดขาย','Discount','Vat','Net Total'].map(h => (
                <th key={h} style={{
                  padding: '10px 12px',
                  textAlign: ['Shop','วันที่','ช่องทาง','ช่วงเวลา'].includes(h) ? 'left' : 'right',
                  color: 'var(--c-muted)', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1f293733', background: i % 2 === 0 ? '#111827' : '#0d1420' }}>
                <td style={{ padding: '8px 12px', color: '#3b82f6', fontWeight: 600 }}>{r.sc}</td>
                <td style={{ padding: '8px 12px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{r.dt}</td>
                <td style={{ padding: '8px 12px', color: 'var(--c-text2)' }}>{r.mo}</td>
                <td style={{ padding: '8px 12px', color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>{r.pd}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{r.bc}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{r.cc}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{r.qt}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(r.bs)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: r.dc > 0 ? '#f87171' : '#374151' }}>{fmt(r.dc)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--c-muted)' }}>{fmt(r.vt)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b' }}>{fmt(r.nt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            ‹
          </button>
          <span style={{ color: 'var(--c-muted)', fontSize: 13 }}>หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            ›
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Report ──────────────────────────────────────────────────────────
// ─── MTD / Compare Tab ───────────────────────────────────────────────────
const MONTH_TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ─── วันหยุดนักขัตฤกษ์ไทย (ปรับปรุงตามประกาศราชการ) ─────────────────────
const THAI_HOLIDAYS = new Set([
  // 2024
  '2024-01-01','2024-02-24','2024-04-06','2024-04-12','2024-04-13','2024-04-14','2024-04-15',
  '2024-05-01','2024-05-04','2024-05-06','2024-05-10','2024-06-03','2024-07-20','2024-07-22',
  '2024-07-28','2024-08-12','2024-10-13','2024-10-23','2024-12-05','2024-12-10','2024-12-31',
  // 2025
  '2025-01-01','2025-02-12','2025-04-06','2025-04-07','2025-04-13','2025-04-14','2025-04-15',
  '2025-05-01','2025-05-05','2025-05-12','2025-06-03','2025-07-10','2025-07-11',
  '2025-07-28','2025-08-12','2025-10-13','2025-10-23','2025-12-05','2025-12-10','2025-12-31',
  // 2026
  '2026-01-01','2026-03-03','2026-04-06','2026-04-13','2026-04-14','2026-04-15',
  '2026-05-01','2026-05-05','2026-06-01','2026-06-03',
  '2026-07-28','2026-08-12','2026-10-13','2026-10-23','2026-12-05','2026-12-10','2026-12-31',
])

function Delta({ value, suffix = '%' }) {
  if (value === null || value === undefined) return <span style={{ color: 'var(--c-muted)', fontSize: 11 }}>— ไม่มีข้อมูลเปรียบเทียบ</span>
  const pos = value >= 0
  return (
    <span style={{ color: pos ? '#10b981' : '#ef4444', fontSize: 12, fontWeight: 700 }}>
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}{suffix}
    </span>
  )
}

// ─── Branch Breakdown Table with sortable columns ─────────────────────────
const BRANCH_COLS = [
  { key: 'sc',      label: 'สาขา',         align: 'left'  },
  { key: 'bs',      label: 'ยอดขาย',       align: 'right' },
  { key: 'sv',      label: 'Svc Charge',   align: 'right' },
  { key: 'total',   label: 'รวม (Sales+SC)',align: 'right' },
  { key: 'pct',     label: '%รวม',         align: 'right' },
  { key: 'bills',   label: 'บิล',          align: 'right' },
  { key: 'cust',    label: 'ลูกค้า',       align: 'right' },
  { key: 'avgBill', label: 'AVG/บิล',      align: 'right' },
  { key: 'avgCust', label: 'AVG/ลูกค้า',   align: 'right' },
  { key: 'disc',    label: 'Discount',     align: 'right' },
]
function BranchTable({ records, latestYM }) {
  const [sortKey, setSortKey] = useState('bs')
  const [sortAsc, setSortAsc] = useState(false)

  const curRecs = records.filter(r => r.dt.slice(0, 7) === latestYM)
  const shopMap2 = {}
  curRecs.forEach(r => {
    if (!shopMap2[r.sc]) shopMap2[r.sc] = { sc: r.sc, bs: 0, sv: 0, bills: 0, cust: 0, disc: 0 }
    shopMap2[r.sc].bs    += r.bs
    shopMap2[r.sc].sv    += (r.sv || 0)
    shopMap2[r.sc].bills += r.bc
    shopMap2[r.sc].cust  += r.cc
    shopMap2[r.sc].disc  += r.dc
  })
  const totalBS = curRecs.reduce((s, r) => s + r.bs, 0)
  const totalSV = curRecs.reduce((s, r) => s + (r.sv || 0), 0)
  const grandTotal = totalBS + totalSV

  const rows = Object.values(shopMap2).map(s => ({
    ...s,
    total:   s.bs + s.sv,
    pct:     grandTotal > 0 ? (s.bs + s.sv) / grandTotal * 100 : 0,
    avgBill: s.bills > 0 ? s.bs / s.bills : 0,
    avgCust: s.cust  > 0 ? s.bs / s.cust  : 0,
  })).sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey]
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? va - vb : vb - va
  })

  const toggle = key => {
    if (key === sortKey) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const thS = (col) => ({
    padding: '8px 10px', textAlign: col.align, color: sortKey === col.key ? '#3b82f6' : '#6b7280',
    fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c-border)',
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })

  return (
    <div style={card}>
      <SectionTitle>🏪 ยอดขายรายสาขา — MTD {latestYM}</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {BRANCH_COLS.map(col => (
                <th key={col.key} style={thS(col)} onClick={() => toggle(col.key)}>
                  {col.label}{sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.sc} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--c-text)', whiteSpace: 'nowrap' }}>{s.sc}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(s.bs)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#06b6d4', fontWeight: 600 }}>{s.sv > 0 ? `฿${fmt(s.sv)}` : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>฿{fmt(s.total)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{s.pct.toFixed(1)}%</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(s.bills)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtInt(s.cust)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{s.bills > 0 ? `฿${fmt(s.avgBill)}` : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ec4899', fontWeight: 600 }}>{s.cust > 0 ? `฿${fmt(s.avgCust)}` : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f87171' }}>฿{fmt(s.disc)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--c-border)', background: 'var(--c-card-inner)' }}>
              <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--c-text)' }}>รวม</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#10b981', fontWeight: 800 }}>฿{fmt(totalBS)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#06b6d4', fontWeight: 700 }}>{totalSV > 0 ? `฿${fmt(totalSV)}` : '—'}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 800 }}>฿{fmt(grandTotal)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>100%</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>{fmtInt(rows.reduce((s,r)=>s+r.bills,0))}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>{fmtInt(rows.reduce((s,r)=>s+r.cust,0))}</td>
              <td colSpan={2} />
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f87171', fontWeight: 600 }}>฿{fmt(rows.reduce((s,r)=>s+r.disc,0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MTDTab({ records, allRecords, targets, monthTargets }) {
  const monthMap = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const ym = r.dt.slice(0, 7)
      if (!map[ym]) map[ym] = { bs: 0, bills: 0, cust: 0, qty: 0, disc: 0, nt: 0, days: new Set(), wdDays: new Set(), weDays: new Set(), phDays: new Set(), periods: new Set(), wdBS: 0, weBS: 0, phBS: 0 }
      const dow = new Date(r.dt).getDay() // 0=Sun, 6=Sat
      const isPH = THAI_HOLIDAYS.has(r.dt)
      const isWE = dow === 0 || dow === 6
      map[ym].bs    += r.bs
      map[ym].bills += r.bc
      map[ym].cust  += r.cc
      map[ym].qty   += r.qt
      map[ym].disc  += r.dc
      map[ym].nt    += r.nt
      map[ym].days.add(r.dt)
      if (r.pd) map[ym].periods.add(r.pd)
      if (isPH)      { map[ym].phDays.add(r.dt); map[ym].phBS += r.bs }
      else if (isWE) { map[ym].weDays.add(r.dt); map[ym].weBS += r.bs }
      else           { map[ym].wdDays.add(r.dt); map[ym].wdBS += r.bs }
    })
    return map
  }, [records])

  const months = Object.keys(monthMap).sort()
  if (!months.length) return <p style={{ color: 'var(--c-muted)' }}>ไม่มีข้อมูล</p>

  const years = [...new Set(months.map(ym => ym.slice(0, 4)))].sort()

  // Latest month stats
  const latestYM   = months[months.length - 1]
  const [ly, lm]   = latestYM.split('-')
  // Compute prevYM from date math so it works even when only one month is in filtered records
  const prevDate   = new Date(parseInt(ly), parseInt(lm) - 2, 1)
  const prevYM     = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const yoyYM      = `${parseInt(ly) - 1}-${lm}`
  // Check that prev/yoy months actually have data in allRecords
  const allRec     = allRecords || records
  const hasPrev    = allRec.some(r => r.dt.startsWith(prevYM))
  const hasYoy     = allRec.some(r => r.dt.startsWith(yoyYM))

  const cur  = monthMap[latestYM]

  // Latest day in current month — use actual latest data day as comparison cutoff
  const latestDay = [...cur.days].sort().pop()?.slice(8, 10) || '31'
  const cmpDay    = latestDay

  // Detect if viewing a completed historical month (not the current month)
  const todayObj   = new Date()
  const currentYM  = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}`
  const isHistorical = latestYM < currentYM

  const sumUpto = (ym, uptoDay) => {
    const s = { bs: 0, bills: 0, cust: 0, disc: 0, days: new Set() }
    allRec.filter(r => r.dt.slice(0, 7) === ym && r.dt.slice(8, 10) <= uptoDay)
      .forEach(r => { s.bs += r.bs; s.bills += r.bc; s.cust += r.cc; s.disc += r.dc; s.days.add(r.dt) })
    return s.days.size > 0 ? s : null
  }
  const sumFull = (ym) => {
    const s = { bs: 0, bills: 0, cust: 0, disc: 0, days: new Set() }
    allRec.filter(r => r.dt.slice(0, 7) === ym)
      .forEach(r => { s.bs += r.bs; s.bills += r.bc; s.cust += r.cc; s.disc += r.dc; s.days.add(r.dt) })
    return s.days.size > 0 ? s : null
  }

  const prev = hasPrev ? (isHistorical ? sumFull(prevYM) : sumUpto(prevYM, cmpDay)) : null
  const yoy  = hasYoy  ? (isHistorical ? sumFull(yoyYM)  : sumUpto(yoyYM,  cmpDay)) : null

  const momBS   = prev ? (cur.bs - prev.bs)       / prev.bs    * 100 : null
  const yoyBS   = yoy  ? (cur.bs - yoy.bs)        / yoy.bs     * 100 : null
  const momBill = prev ? (cur.bills - prev.bills)  / prev.bills * 100 : null
  const yoyBill = yoy  ? (cur.bills - yoy.bills)   / yoy.bills  * 100 : null

  // Monthly chart data
  const monthlyData = months.map(ym => {
    const m   = monthMap[ym]
    const [y, mo] = ym.split('-')
    const days = m.days.size
    return {
      ym,
      label:    `${MONTH_TH[parseInt(mo)]} ${y}`,
      bs:       Math.round(m.bs),
      bills:    m.bills,
      cust:     m.cust,
      days,
      avgDaily: days > 0 ? Math.round(m.bs / days) : 0,
      avgBill:  m.bills > 0 ? m.bs / m.bills : 0,
      avgCust:  m.cust  > 0 ? m.bs / m.cust  : 0,
      disc:     Math.round(m.disc),
      discPct:  (m.bs + m.disc) > 0 ? m.disc / (m.bs + m.disc) * 100 : 0,
      avgWeekday: m.wdDays.size > 0 ? Math.round(m.wdBS / m.wdDays.size) : 0,
      avgWeekend: m.weDays.size > 0 ? Math.round(m.weBS / m.weDays.size) : 0,
      avgHoliday: m.phDays.size > 0 ? Math.round(m.phBS / m.phDays.size) : 0,
      wdDays:   m.wdDays.size,
      weDays:   m.weDays.size,
      phDays:   m.phDays.size,
      periods:  m.periods.size,
      periodList: [...m.periods].sort(),
      tgt:      monthTargets?.[ym] || 0,
    }
  })

  // YoY matrix: rows = month number, cols = year
  const allMonthNums = [...new Set(months.map(ym => ym.slice(5)))].sort()

  // ── Gauge + Forecast (computed once, shown at top) ──────────────────────
  const curSV_gauge = allRec.filter(r => r.dt.slice(0,7) === latestYM).reduce((s,r) => s+(r.sv||0), 0)
  const curActual   = cur.bs + curSV_gauge   // Sales + Service Charge
  const gaugeTgt    = monthTargets?.[latestYM] || 0
  const gaugePct    = gaugeTgt > 0 ? curActual / gaugeTgt * 100 : null
  const gaugeCol    = gaugePct === null ? '#6b7280' : gaugePct >= 100 ? '#10b981' : gaugePct >= 80 ? '#f59e0b' : '#ef4444'
  const gaugeData   = gaugeTgt > 0 ? [{ value: Math.min(curActual, gaugeTgt) }, { value: Math.max(0, gaugeTgt - curActual) }] : null
  const daysInMonth  = new Date(parseInt(ly), parseInt(lm), 0).getDate()
  const avgWD = cur.wdDays.size > 0 ? cur.wdBS / cur.wdDays.size : 0
  const avgWE = cur.weDays.size > 0 ? cur.weBS / cur.weDays.size : 0
  const avgPH = cur.phDays.size > 0 ? cur.phBS / cur.phDays.size : avgWE
  let projRemaining = 0
  const remDays = { wd: 0, we: 0, ph: 0 }
  for (let d = parseInt(latestDay) + 1; d <= daysInMonth; d++) {
    const dt  = `${ly}-${lm}-${String(d).padStart(2, '0')}`
    const dow = new Date(dt).getDay()
    const isPH = THAI_HOLIDAYS.has(dt)
    const isWE = dow === 0 || dow === 6
    if (isPH)      { projRemaining += avgPH; remDays.ph++ }
    else if (isWE) { projRemaining += avgWE; remDays.we++ }
    else           { projRemaining += avgWD; remDays.wd++ }
  }
  const totalRem = remDays.wd + remDays.we + remDays.ph
  const forecast = Math.round(curActual + projRemaining)
  const fcPct    = gaugeTgt > 0 ? forecast / gaugeTgt * 100 : null
  const fcCol    = fcPct === null ? '#6b7280' : fcPct >= 100 ? '#10b981' : fcPct >= 80 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Gauge + Forecast ── */}
      {gaugeData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Half-donut gauge */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 4, alignSelf: 'flex-start' }}>🎯 ยอดขาย vs เป้า (MTD)</p>
            <div style={{ position: 'relative', width: 220, height: 120 }}>
              <PieChart width={220} height={120}>
                <Pie data={gaugeData} cx={110} cy={110} startAngle={180} endAngle={0} innerRadius={65} outerRadius={95} dataKey="value" strokeWidth={0}>
                  <Cell fill={gaugeCol} />
                  <Cell fill="#1f2937" />
                </Pie>
              </PieChart>
              <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: gaugeCol, lineHeight: 1 }}>{gaugePct.toFixed(1)}%</p>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>฿{fmt(curActual)}</p>
              <p style={{ fontSize: 10, color: '#06b6d4' }}>Sales ฿{fmt(cur.bs)} + SC ฿{fmt(curSV_gauge)}</p>
              <p style={{ fontSize: 11, color: 'var(--c-muted)' }}>เป้า ฿{fmt(gaugeTgt)}</p>
            </div>
            <div style={{ marginTop: 10, width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--c-muted)' }}>{curActual >= gaugeTgt ? 'เกินเป้า' : 'ยังขาดอีก'}</span>
              <span style={{ color: curActual >= gaugeTgt ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                {curActual >= gaugeTgt ? '+' : '-'}฿{fmt(Math.abs(gaugeTgt - curActual))}
              </span>
            </div>
          </div>

          {/* Forecast card */}
          <div style={card}>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 10 }}>📈 คาดการณ์ปิดเดือน {MONTH_TH[+lm]}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: fcCol }}>฿{fmt(forecast)}</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>เป้า ฿{fmt(gaugeTgt)} · {fcPct !== null ? `${fcPct.toFixed(1)}%` : '—'}</p>
            <div style={{ background: '#1f2937', borderRadius: 4, height: 6, marginTop: 8 }}>
              <div style={{ background: fcCol, height: 6, borderRadius: 4, width: `${Math.min(fcPct || 0, 100)}%`, transition: 'width .4s' }} />
            </div>
            {totalRem > 0 ? (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 6 }}>เหลืออีก {totalRem} วัน · คาดเพิ่ม ฿{fmt(projRemaining)}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {remDays.wd > 0 && <div style={{ fontSize: 10, display: 'flex', gap: 4 }}><span style={{ color: 'var(--c-muted)', minWidth: 44 }}>ธรรมดา</span><span style={{ color: '#38bdf8', fontWeight: 700 }}>฿{fmt(avgWD)}</span><span style={{ color: 'var(--c-muted)' }}>× {remDays.wd}วัน</span></div>}
                  {remDays.we > 0 && <div style={{ fontSize: 10, display: 'flex', gap: 4 }}><span style={{ color: 'var(--c-muted)', minWidth: 44 }}>ส-อ</span><span style={{ color: '#fb923c', fontWeight: 700 }}>฿{fmt(avgWE)}</span><span style={{ color: 'var(--c-muted)' }}>× {remDays.we}วัน</span></div>}
                  {remDays.ph > 0 && <div style={{ fontSize: 10, display: 'flex', gap: 4 }}><span style={{ color: 'var(--c-muted)', minWidth: 44 }}>นักขัต</span><span style={{ color: '#f472b6', fontWeight: 700 }}>฿{fmt(avgPH)}</span><span style={{ color: 'var(--c-muted)' }}>× {remDays.ph}วัน</span></div>}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 8 }}>ครบเดือนแล้ว</p>
            )}
          </div>
        </div>
      )}

      {/* ── Comparison KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>

        {/* ยอดขาย MTD */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>ยอดขาย (MTD)</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>฿{fmt(cur.bs)}</p>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--c-muted)' }}>vs เดือนก่อน</span>
              <Delta value={momBS} />
            </div>
            {prev && <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>({MONTH_TH[parseInt(prevYM.slice(5))]} 1–{parseInt(cmpDay)} ฿{fmt(prev.bs)})</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span style={{ color: 'var(--c-muted)' }}>vs ปีก่อน (YoY)</span>
              <Delta value={yoyBS} />
            </div>
            {yoy && <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>({MONTH_TH[parseInt(lm)]} {parseInt(ly)-1} 1–{parseInt(cmpDay)} ฿{fmt(yoy.bs)})</div>}
          </div>
        </div>

        {/* Bills MTD */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>จำนวนบิล (MTD)</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{fmtInt(cur.bills)}</p>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--c-muted)' }}>vs เดือนก่อน (1–{parseInt(cmpDay)})</span>
              <Delta value={momBill} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span style={{ color: 'var(--c-muted)' }}>vs ปีก่อน YoY (1–{parseInt(cmpDay)})</span>
              <Delta value={yoyBill} />
            </div>
          </div>
        </div>

        {/* AVG Daily */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG ยอดขาย/วัน</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>
            ฿{fmt(cur.days.size > 0 ? cur.bs / cur.days.size : 0)}
          </p>
          {prev && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 8 }}>
              เดือนก่อน: ฿{fmt(prev.days.size > 0 ? prev.bs / prev.days.size : 0)}
            </p>
          )}
          {yoy && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
              ปีก่อน: ฿{fmt(yoy.days.size > 0 ? yoy.bs / yoy.days.size : 0)}
            </p>
          )}
        </div>

        {/* AVG per Bill */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG ยอด/บิล</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6' }}>
            ฿{fmt(cur.bills > 0 ? cur.bs / cur.bills : 0)}
          </p>
          {prev && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 8 }}>
              เดือนก่อน: ฿{fmt(prev.bills > 0 ? prev.bs / prev.bills : 0)}
            </p>
          )}
          {yoy && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
              ปีก่อน: ฿{fmt(yoy.bills > 0 ? yoy.bs / yoy.bills : 0)}
            </p>
          )}
        </div>

        {/* AVG per Customer */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG ยอด/ลูกค้า</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#ec4899' }}>
            ฿{fmt(cur.cust > 0 ? cur.bs / cur.cust : 0)}
          </p>
          {prev && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 8 }}>
              เดือนก่อน: ฿{fmt(prev.cust > 0 ? prev.bs / prev.cust : 0)}
            </p>
          )}
          {yoy && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
              ปีก่อน: ฿{fmt(yoy.cust > 0 ? yoy.bs / yoy.cust : 0)}
            </p>
          )}
        </div>

        {/* Discount rate */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>ส่วนลด (MTD)</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>฿{fmt(cur.disc)}</p>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
            {((cur.bs + cur.disc) > 0 ? cur.disc / (cur.bs + cur.disc) * 100 : 0).toFixed(2)}% ของยอดรวม
          </p>
          {prev && (
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 6 }}>
              เดือนก่อน: ฿{fmt(prev.disc)} ({((prev.bs + prev.disc) > 0 ? prev.disc / (prev.bs + prev.disc) * 100 : 0).toFixed(2)}%)
            </p>
          )}
        </div>

        {/* Service Charge */}
        {(() => {
          const curSV  = allRec.filter(r => r.dt.slice(0,7) === latestYM).reduce((s,r) => s+(r.sv||0), 0)
          const prevSV = prev ? allRec.filter(r => r.dt.slice(0,7) === prevYM && r.dt.slice(8,10) <= cmpDay).reduce((s,r) => s+(r.sv||0), 0) : null
          const yoySV  = yoy  ? allRec.filter(r => r.dt.slice(0,7) === yoyYM  && r.dt.slice(8,10) <= cmpDay).reduce((s,r) => s+(r.sv||0), 0) : null
          if (curSV === 0 && prevSV === 0) return null
          const svPct  = cur.bs > 0 ? curSV / cur.bs * 100 : 0
          return (
            <div style={card}>
              <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>Service Charge (MTD)</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>฿{fmt(curSV)}</p>
              <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>{svPct.toFixed(2)}% ของยอดขาย</p>
              {prevSV !== null && <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 6 }}>เดือนก่อน: ฿{fmt(prevSV)}</p>}
              {yoySV  !== null && <p style={{ fontSize: 12, color: 'var(--c-muted)' }}>ปีก่อน: ฿{fmt(yoySV)}</p>}
            </div>
          )
        })()}

        {/* AVG Weekday */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG วันธรรมดา/วัน</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8' }}>
            {cur.wdDays.size > 0 ? `฿${fmt(cur.wdBS / cur.wdDays.size)}` : '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 6 }}>{cur.wdDays.size} วัน</p>
        </div>

        {/* AVG Weekend */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG เสาร์-อาทิตย์/วัน</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#fb923c' }}>
            {cur.weDays.size > 0 ? `฿${fmt(cur.weBS / cur.weDays.size)}` : '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 6 }}>{cur.weDays.size} วัน</p>
        </div>

        {/* AVG Holiday */}
        <div style={card}>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>AVG วันหยุดนักขัตฤกษ์/วัน</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#f472b6' }}>
            {cur.phDays.size > 0 ? `฿${fmt(cur.phBS / cur.phDays.size)}` : '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 6 }}>{cur.phDays.size} วัน</p>
        </div>
      </div>

      {/* ── Target vs Actual ── */}
      {targets?.[latestYM] && (() => {
        const tData = targets[latestYM]
        const pctColor = p => p >= 100 ? '#10b981' : p >= 80 ? '#f59e0b' : '#ef4444'
        const getTotal = v => typeof v === 'object' ? (v.total || 0) : (v || 0)

        const TargetCard = ({ label, actual, tObj, subRows }) => {
          const target = getTotal(tObj)
          const pct    = target > 0 ? actual / target * 100 : 0
          const col    = pctColor(pct)
          return (
            <div style={{ background: 'var(--c-card-inner)', borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 6 }}>{label}</p>
              <p style={{ fontSize: 17, fontWeight: 800, color: '#10b981' }}>฿{fmt(actual)}</p>
              <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>เป้า ฿{fmt(target)}</p>
              <div style={{ background: 'var(--c-surface)', borderRadius: 4, height: 6, marginTop: 8 }}>
                <div style={{ background: col, height: 6, borderRadius: 4, width: `${Math.min(pct,100)}%`, transition: 'width .4s' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 800, color: col, marginTop: 6 }}>{pct.toFixed(2)}%</p>
              {/* Day type breakdown */}
              {tObj?.wdPerDay !== undefined && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    { label: 'ธรรมดา', perDay: tObj.wdPerDay, days: tObj.wdDays, color: '#38bdf8' },
                    { label: 'ส-อ',    perDay: tObj.wePerDay, days: tObj.weDays, color: '#fb923c' },
                    tObj.phDays > 0 && { label: 'นักขัต', perDay: tObj.phPerDay, days: tObj.phDays, color: '#f472b6' },
                  ].filter(Boolean).map(d => (
                    <div key={d.label} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--c-muted)', minWidth: 44 }}>{d.label}</span>
                      <span style={{ color: d.color, fontWeight: 700 }}>฿{fmt(d.perDay)}</span>
                      <span style={{ color: 'var(--c-muted)' }}>× {d.days}วัน</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }

        const allEntry = tData['all']
        const shopEntries = Object.entries(tData).filter(([k]) => k !== 'all')
        return (
          <div style={{ ...card, border: '1px solid #3b82f630' }}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#3b82f6' }}>
              🎯 เทียบเป้า {latestYM}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
              {allEntry   && <TargetCard label="รวมทุกสาขา" actual={cur.bs} tObj={allEntry} />}
              {shopEntries.map(([sc, tObj]) => {
                const shopBS = allRec.filter(r => r.dt.slice(0,7) === latestYM && r.sc === sc).reduce((s,r)=>s+r.bs,0)
                return <TargetCard key={sc} label={sc} actual={shopBS} tObj={tObj} />
              })}
            </div>
          </div>
        )
      })()}

      {/* ── AVG + Branch side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* ── MTD AVG KPIs + per-branch ── */}
      {(() => {
        const curRec = allRec.filter(r => r.dt.slice(0,7) === latestYM)
        const shops = [...new Set(curRec.map(r => r.sc))].sort()
        const branchAvg = shops.map(sc => {
          const rows = curRec.filter(r => r.sc === sc)
          const bs    = rows.reduce((s,r) => s+r.bs, 0)
          const bills = rows.reduce((s,r) => s+r.bc, 0)
          const cust  = rows.reduce((s,r) => s+r.cc, 0)
          return { sc, avgCust: cust > 0 ? bs/cust : 0, avgBill: bills > 0 ? bs/bills : 0, cust, bills }
        })
        return (
          <div style={card}>
              {branchAvg.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={branchAvg} margin={{ top: 24, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                  <XAxis dataKey="sc" tick={{ fill: 'var(--c-text)', fontSize: 12, fontWeight: 600 }} />
                  <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `฿${fmt(v)}`} />
                  <Tooltip
                    contentStyle={tooltip.contentStyle}
                    formatter={(v, name) => [`฿${fmt(v)}`, name]}
                  />
                  <Legend formatter={v => <span style={{ fontSize: 11, color: 'var(--c-text2)' }}>{v}</span>} />
                  <Bar dataKey="avgCust" name="AVG/ลูกค้า" fill="#f59e0b" radius={[4,4,0,0]}>
                    <LabelList content={({ x, y, width, value }) => (
                      <text x={x + width / 2} y={y + 13} textAnchor="middle" style={{ fill: '#1f2937' }} fontSize={10} fontWeight={700}>
                        ฿{fmt(value)}
                      </text>
                    )} />
                  </Bar>
                  <Line dataKey="avgBill" name="AVG/บิล" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 4 }} type="monotone">
                    <LabelList content={({ x, y, value }) => (
                      <text x={x} y={y - 10} textAnchor="middle" style={{ fill: '#8b5cf6' }} fontSize={10} fontWeight={600}>
                        ฿{fmt(value)}
                      </text>
                    )} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )
      })()}
      {/* ── Branch Bar Chart ── */}
      {(() => {
        const branchData = [...new Set(allRec.filter(r => r.dt.slice(0,7) === latestYM).map(r => r.sc))].sort().map(sc => {
          const bs = allRec.filter(r => r.dt.slice(0,7) === latestYM && r.sc === sc).reduce((s,r) => s+r.bs, 0)
          return { sc, bs }
        }).sort((a,b) => b.bs - a.bs)
        if (!branchData.length) return null
        return (
          <div style={card}>
            <SectionTitle>🏪 ยอดขายรายสาขา — MTD {latestYM}</SectionTitle>
            <ResponsiveContainer width="100%" height={Math.max(220, branchData.length * 36)}>
              <BarChart data={branchData} layout="vertical" margin={{ top: 4, right: 80, left: 20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis type="number" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => fmtBar(v)} />
                <YAxis type="category" dataKey="sc" tick={{ fill: 'var(--c-text)', fontSize: 12, fontWeight: 600 }} width={55} />
                <Tooltip formatter={v => [`฿${fmt(v)}`, 'ยอดขาย']} contentStyle={tooltip.contentStyle} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="bs" name="ยอดขาย" fill="#3b82f6" radius={[0,4,4,0]}>
                  <LabelList content={({ x, y, width, height, value }) => (
                    <text x={x + width + 6} y={y + height / 2 + 4} style={{ fill: 'var(--c-text)' }} fontSize={11} fontWeight={600}>
                      {fmtBar(value)}
                    </text>
                  )} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })()}
      </div>

      {/* ── Channel Comparison Table ── */}
      {(() => {
        // Build per-channel stats for cur / prev / yoy
        const chCur = {}, chPrev = {}, chYoy = {}
        const addTo = (map, mo, bs, bc, cc) => {
          if (!map[mo]) map[mo] = { bs: 0, bc: 0, cc: 0 }
          map[mo].bs += bs; map[mo].bc += bc; map[mo].cc += cc
        }
        allRec.forEach(r => {
          const ym = r.dt.slice(0, 7)
          const day = r.dt.slice(8, 10)
          if (ym === latestYM)                                      addTo(chCur,  r.mo, r.bs, r.bc, r.cc)
          if (hasPrev && ym === prevYM && day <= cmpDay)            addTo(chPrev, r.mo, r.bs, r.bc, r.cc)
          if (hasYoy  && ym === yoyYM  && day <= cmpDay)            addTo(chYoy,  r.mo, r.bs, r.bc, r.cc)
        })
        const channels = [...new Set(Object.keys(chCur))].sort((a,b) => (chCur[b]?.bs||0)-(chCur[a]?.bs||0))
        const totalCur  = Object.values(chCur).reduce((s,v)=>s+v.bs,0)
        const totalPrev = Object.values(chPrev).reduce((s,v)=>s+v.bs,0)
        const totalYoy  = Object.values(chYoy).reduce((s,v)=>s+v.bs,0)
        const delta = (cur, prev) => prev > 0 ? (cur - prev) / prev * 100 : null
        const thS = { padding: '8px 10px', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid #374151', whiteSpace: 'nowrap', fontSize: 11 }
        const tdS = (align='right') => ({ padding: '7px 10px', textAlign: align, borderBottom: '1px solid #1f293755', whiteSpace: 'nowrap' })
        return (
          <div style={card}>
            <SectionTitle>📡 ช่องทางขาย — เทียบเดือนก่อน & ปีก่อน (ถึงวันที่ {parseInt(cmpDay)})</SectionTitle>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>ช่องทาง</th>
                    <th style={{ ...thS, textAlign: 'right', color: '#10b981' }}>MTD ({MONTH_TH[+lm]})</th>
                    <th style={{ ...thS, textAlign: 'right' }}>%รวม</th>
                    {prevYM && <th style={{ ...thS, textAlign: 'right' }}>{MONTH_TH[+prevYM.slice(5)]} (1–{parseInt(cmpDay)})</th>}
                    {prevYM && <th style={{ ...thS, textAlign: 'right' }}>MoM%</th>}
                    {yoyYM && <th style={{ ...thS, textAlign: 'right' }}>{MONTH_TH[+lm]} {+ly-1} (1–{parseInt(cmpDay)})</th>}
                    {yoyYM && <th style={{ ...thS, textAlign: 'right' }}>YoY%</th>}
                    <th style={{ ...thS, textAlign: 'right' }}>บิล</th>
                    <th style={{ ...thS, textAlign: 'right' }}>AVG/บิล</th>
                    <th style={{ ...thS, textAlign: 'right' }}>ลูกค้า</th>
                    <th style={{ ...thS, textAlign: 'right' }}>AVG/ลูกค้า</th>
                    {prevYM && <th style={{ ...thS, textAlign: 'right' }}>AVG/ลูกค้า MoM%</th>}
                    {yoyYM  && <th style={{ ...thS, textAlign: 'right' }}>AVG/ลูกค้า YoY%</th>}
                  </tr>
                </thead>
                <tbody>
                  {channels.map(ch => {
                    const c = chCur[ch]  || { bs:0, bc:0, cc:0 }
                    const p = chPrev[ch] || null
                    const y = chYoy[ch]  || null
                    const pct       = totalCur > 0 ? c.bs / totalCur * 100 : 0
                    const mom       = p ? delta(c.bs, p.bs) : null
                    const yoy_d     = y ? delta(c.bs, y.bs) : null
                    const avgCust   = c.cc  > 0 ? c.bs / c.cc  : null
                    const avgCustP  = p && p.cc > 0 ? p.bs / p.cc : null
                    const avgCustY  = y && y.cc > 0 ? y.bs / y.cc : null
                    const momAvgC   = avgCust && avgCustP ? delta(avgCust, avgCustP) : null
                    const yoyAvgC   = avgCust && avgCustY ? delta(avgCust, avgCustY) : null
                    return (
                      <tr key={ch}>
                        <td style={{ ...tdS('left'), color: 'var(--c-text2)', fontWeight: 600 }}>{ch}</td>
                        <td style={{ ...tdS(), color: '#10b981', fontWeight: 700 }}>฿{fmt(c.bs)}</td>
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{pct.toFixed(2)}%</td>
                        {prevYM && <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{p ? `฿${fmt(p.bs)}` : '—'}</td>}
                        {prevYM && <td style={tdS()}><Delta value={mom} /></td>}
                        {yoyYM && <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{y ? `฿${fmt(y.bs)}` : '—'}</td>}
                        {yoyYM && <td style={tdS()}><Delta value={yoy_d} /></td>}
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{fmtInt(c.bc)}</td>
                        <td style={{ ...tdS(), color: '#8b5cf6' }}>{c.bc > 0 ? `฿${fmt(c.bs/c.bc)}` : '—'}</td>
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{fmtInt(c.cc)}</td>
                        <td style={{ ...tdS(), color: '#ec4899', fontWeight: 600 }}>{avgCust ? `฿${fmt(avgCust)}` : '—'}</td>
                        {prevYM && <td style={tdS()}><Delta value={momAvgC} /></td>}
                        {yoyYM  && <td style={tdS()}><Delta value={yoyAvgC} /></td>}
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  {(() => {
                    const totBc  = Object.values(chCur).reduce((s,v)=>s+v.bc,0)
                    const totCc  = Object.values(chCur).reduce((s,v)=>s+v.cc,0)
                    const totPCc = Object.values(chPrev).reduce((s,v)=>s+v.cc,0)
                    const totYCc = Object.values(chYoy).reduce((s,v)=>s+v.cc,0)
                    const totPBs = Object.values(chPrev).reduce((s,v)=>s+v.bs,0)
                    const totYBs = Object.values(chYoy).reduce((s,v)=>s+v.bs,0)
                    const avgC   = totCc  > 0 ? totalCur  / totCc  : null
                    const avgCP  = totPCc > 0 ? totPBs / totPCc : null
                    const avgCY  = totYCc > 0 ? totYBs / totYCc : null
                    return (
                      <tr style={{ background: 'var(--c-card-inner)', fontWeight: 700 }}>
                        <td style={{ ...tdS('left'), color: 'var(--c-text)' }}>รวม</td>
                        <td style={{ ...tdS(), color: '#10b981' }}>฿{fmt(totalCur)}</td>
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>100%</td>
                        {prevYM && <td style={{ ...tdS(), color: 'var(--c-muted)' }}>฿{fmt(totalPrev)}</td>}
                        {prevYM && <td style={tdS()}><Delta value={delta(totalCur, totalPrev)} /></td>}
                        {yoyYM && <td style={{ ...tdS(), color: 'var(--c-muted)' }}>฿{fmt(totalYoy)}</td>}
                        {yoyYM && <td style={tdS()}><Delta value={delta(totalCur, totalYoy)} /></td>}
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{fmtInt(totBc)}</td>
                        <td style={{ ...tdS(), color: '#8b5cf6' }}>{totBc > 0 ? `฿${fmt(totalCur/totBc)}` : '—'}</td>
                        <td style={{ ...tdS(), color: 'var(--c-muted)' }}>{fmtInt(totCc)}</td>
                        <td style={{ ...tdS(), color: '#ec4899' }}>{avgC ? `฿${fmt(avgC)}` : '—'}</td>
                        {prevYM && <td style={tdS()}><Delta value={avgC && avgCP ? delta(avgC, avgCP) : null} /></td>}
                        {yoyYM  && <td style={tdS()}><Delta value={avgC && avgCY ? delta(avgC, avgCY) : null} /></td>}
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Branch Breakdown Table (current month) ── */}
      <BranchTable records={records} latestYM={latestYM} />
    </div>
  )
}

// ─── Item Report constants ─────────────────────────────────────────────────
const ITEM_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#6366f1']
const ITEM_FIELDS = [
  { key: 'date',     label: 'วันที่',              required: true  },
  { key: 'shop',     label: 'รหัสสาขา',            required: true  },
  { key: 'category', label: 'Category / หมวดหมู่',  required: true  },
  { key: 'amount',   label: 'ยอดขาย (บาท)',        required: true  },
  { key: 'item',     label: 'ชื่อสินค้า',          required: false },
  { key: 'qty',      label: 'จำนวน / Qty',         required: false },
  { key: 'channel',  label: 'ช่องทางขาย',          required: false },
  { key: 'hour',     label: 'ชั่วโมง / Period',    required: false },
]

// ─── Item Column Mapper ────────────────────────────────────────────────────
function ItemColMapper({ allColumns, colMap, onSave }) {
  const [draft, setDraft] = useState({ ...colMap })
  const canSave = draft.date && draft.category && draft.amount && draft.shop
  return (
    <div style={{ ...card, borderColor: '#3b82f644', marginBottom: 20 }}>
      <p style={{ fontWeight: 700, fontSize: 14, color: '#3b82f6', marginBottom: 4 }}>⚙️ ตั้งค่าคอลัมน์รายการขาย</p>
      <p style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14 }}>เลือกคอลัมน์จากไฟล์ Excel ให้ตรงกับข้อมูล (* = จำเป็น)</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, marginBottom: 14 }}>
        {ITEM_FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: 'var(--c-muted)', display: 'block', marginBottom: 3 }}>{f.label}{f.required ? ' *' : ''}</label>
            <select
              value={draft[f.key] || ''}
              onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '6px 8px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 6, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value="">— ไม่ระบุ —</option>
              {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSave(draft)}
        disabled={!canSave}
        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: canSave ? 1 : 0.5 }}
      >
        บันทึกการตั้งค่า
      </button>
    </div>
  )
}

// ─── Item × Date Pivot Tables ──────────────────────────────────────────────
function ItemDatePivot({ items, categories, records = [] }) {
  const [filterCat,    setFilterCat]    = useState('')
  const [filterSc,     setFilterSc]     = useState('')
  const [filterCh,     setFilterCh]     = useState('')
  const [filterYear,   setFilterYear]   = useState('')
  const [filterMonth,  setFilterMonth]  = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [search,       setSearch]       = useState('')
  const [compareMode,  setCompareMode]  = useState('qty') // 'qty' | 'bill' | 'cust'

  const shops    = useMemo(() => [...new Set(items.map(r => r.sc))].sort(), [items])
  const channels = useMemo(() => [...new Set(items.map(r => r.ch))].filter(Boolean).sort(), [items])
  const years    = useMemo(() => [...new Set(items.map(r => r.dt.slice(0,4)))].sort().reverse(), [items])
  const itemNames = useMemo(() => [...new Set(items.map(r => r.itm || r.cat).filter(Boolean))].sort(), [items])
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(r =>
      (!filterCat   || r.cat === filterCat) &&
      (!filterSc    || r.sc  === filterSc) &&
      (!filterCh    || r.ch  === filterCh) &&
      (!filterYear  || r.dt.slice(0,4) === filterYear) &&
      (!filterMonth || r.dt.slice(5,7) === filterMonth) &&
      (!dateFrom    || r.dt >= dateFrom) &&
      (!dateTo      || r.dt <= dateTo) &&
      (!q || (r.itm || r.cat || '').toLowerCase().includes(q))
    )
  }, [items, filterCat, filterSc, filterCh, filterYear, filterMonth, dateFrom, dateTo, search])

  const dates = useMemo(() => [...new Set(filtered.map(r => r.dt))].sort(), [filtered])

  const { rows, dateTotals } = useMemo(() => {
    const map = {}
    const totals = {}
    filtered.forEach(r => {
      const k = r.sc
      if (!map[k]) map[k] = { k, total: 0, byDate: {} }
      map[k].total += r.qty
      map[k].byDate[r.dt] = (map[k].byDate[r.dt] || 0) + r.qty
      totals[r.dt] = (totals[r.dt] || 0) + r.qty
    })
    return {
      rows: Object.values(map).sort((a,b) => b.total - a.total),
      dateTotals: totals,
    }
  }, [filtered])

  // Daily bill/customer counts from transaction records
  const dailyCounts = useMemo(() => {
    const counts = {}
    records.forEach(r => {
      if (filterSc    && r.sc  !== filterSc)    return
      if (filterCh    && r.mo  !== filterCh)    return
      if (filterYear  && r.dt.slice(0,4) !== filterYear)  return
      if (filterMonth && r.dt.slice(5,7)  !== filterMonth) return
      if (dateFrom    && r.dt < dateFrom)  return
      if (dateTo      && r.dt > dateTo)    return
      if (!counts[r.dt]) counts[r.dt] = { bills: 0, cust: 0 }
      counts[r.dt].bills += (r.bc || 0)
      counts[r.dt].cust  += (r.cc || 0)
    })
    return counts
  }, [records, filterSc, filterCh, filterYear, filterMonth, dateFrom, dateTo])

  if (!rows.length) return null

  const selS  = { padding: '5px 10px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 7, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }
  const thS   = (align = 'right') => ({ padding: '6px 8px', textAlign: align, color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap', fontSize: 11, position: 'sticky', top: 0, background: 'var(--c-card)' })
  const tdS   = (align = 'right', extra = {}) => ({ padding: '5px 8px', textAlign: align, borderBottom: '1px solid var(--c-border)', fontSize: 11, ...extra })
  const catColor = (cat) => { const idx = (categories || []).indexOf(cat); return ITEM_COLORS[idx >= 0 ? idx % ITEM_COLORS.length : 0] }
  const fmtDt = (dt) => {
    const sameMonth = dates.length > 0 && dates.every(d => d.slice(0,7) === dates[0].slice(0,7))
    return sameMonth ? String(+dt.slice(8)) : `${+dt.slice(8)}/${+dt.slice(5,7)}`
  }
  const getDenom = (d) => {
    if (compareMode === 'bill') return dailyCounts[d]?.bills || 0
    if (compareMode === 'cust') return dailyCounts[d]?.cust  || 0
    return dateTotals[d] || 0
  }

  const MONTHS = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

  const clearFilter = () => { setFilterCat(''); setFilterSc(''); setFilterCh(''); setFilterYear(''); setFilterMonth(''); setDateFrom(''); setDateTo(''); setSearch('') }
  const hasFilter = filterCat || filterSc || filterCh || filterYear || filterMonth || dateFrom || dateTo || search

  const cmpLabel = compareMode === 'bill' ? 'Bill' : compareMode === 'cust' ? 'ลูกค้า' : 'Qty รวม'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 14px' }}>
        <select value={filterYear}  onChange={e => setFilterYear(e.target.value)}  style={selS}>
          <option value="">ทุกปี</option>
          {years.map(y => <option key={y} value={y}>{+y+543}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={selS}>
          <option value="">ทุกเดือน</option>
          {Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m => <option key={m} value={m}>{MONTHS[+m]}</option>)}
        </select>
        <select value={filterSc}    onChange={e => setFilterSc(e.target.value)}    style={selS}>
          <option value="">ทุกสาขา</option>
          {shops.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCh}    onChange={e => setFilterCh(e.target.value)}    style={selS}>
          <option value="">ทุกช่องทาง</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterCat}   onChange={e => setFilterCat(e.target.value)}   style={selS}>
          <option value="">ทุก Category</option>
          {(categories || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text" placeholder="ค้นหารายการ..." value={search}
          onChange={e => setSearch(e.target.value)}
          list="item-date-pivot-items"
          style={{ ...selS, minWidth: 130 }}
        />
        <datalist id="item-date-pivot-items">
          {itemNames.map(n => <option key={n} value={n} />)}
        </datalist>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...selS, colorScheme: 'dark' }} />
        <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>–</span>
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ ...selS, colorScheme: 'dark' }} />
        {hasFilter && <button onClick={clearFilter} style={{ ...selS, color: '#ef4444', borderColor: '#ef444444' }}>ล้าง</button>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-muted)' }}>{rows.length} รายการ / {dates.length} วัน</span>
      </div>

      {/* Table 1: จำนวน */}
      <div style={card}>
        <SectionTitle>📅 จำนวน × วันที่</SectionTitle>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thS('left'), minWidth: 80 }}>สาขา</th>
                {dates.map(d => <th key={d} style={thS()}>{fmtDt(d)}</th>)}
                <th style={thS()}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ ...tdS('left'), color: 'var(--c-text)', fontWeight: 600 }}>{row.k}</td>
                  {dates.map(d => (
                    <td key={d} style={{ ...tdS(), color: row.byDate[d] ? 'var(--c-text)' : 'var(--c-muted)' }}>
                      {row.byDate[d] || '—'}
                    </td>
                  ))}
                  <td style={{ ...tdS(), color: '#8b5cf6', fontWeight: 700 }}>{fmt(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table 2: % */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <SectionTitle style={{ marginBottom: 0 }}>📊 % × วันที่</SectionTitle>
          <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>เทียบกับ</span>
          {['qty','bill','cust'].map(m => (
            <button key={m} onClick={() => setCompareMode(m)} style={{
              background: compareMode === m ? '#3b82f6' : 'var(--c-card-inner)',
              border: `1px solid ${compareMode === m ? '#3b82f6' : 'var(--c-border)'}`,
              color: compareMode === m ? '#fff' : 'var(--c-muted)',
              borderRadius: 6, padding: '3px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m === 'qty' ? 'Qty รวม' : m === 'bill' ? 'Bill' : 'ลูกค้า'}
            </button>
          ))}
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thS('left'), minWidth: 80 }}>สาขา</th>
                {dates.map(d => <th key={d} style={thS()}>{fmtDt(d)}</th>)}
                <th style={thS()}>AVG%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const activeDates = dates.filter(d => row.byDate[d])
                const avgPct = activeDates.length > 0
                  ? activeDates.reduce((s,d) => { const denom = getDenom(d); return s + (denom > 0 ? row.byDate[d]/denom*100 : 0) }, 0) / activeDates.length
                  : 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ ...tdS('left'), color: 'var(--c-text)', fontWeight: 600 }}>{row.k}</td>
                    {dates.map(d => {
                      const q     = row.byDate[d] || 0
                      const denom = getDenom(d)
                      const pct   = denom > 0 ? q/denom*100 : 0
                      return (
                        <td key={d} style={{ ...tdS(), color: pct > 10 ? '#f59e0b' : pct > 0 ? 'var(--c-text)' : 'var(--c-muted)', fontSize: 10 }}>
                          {pct > 0 ? pct.toFixed(1)+'%' : '—'}
                        </td>
                      )
                    })}
                    <td style={{ ...tdS(), color: '#f59e0b', fontWeight: 700 }}>{avgPct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Item Branch Pivot Tables ──────────────────────────────────────────────
function ItemBranchPivot({ items, categories }) {
  const [filterCat, setFilterCat] = useState('')
  const [search,    setSearch]    = useState('')
  const [filterCh,  setFilterCh]  = useState('')

  const shops    = useMemo(() => [...new Set(items.map(r => r.sc))].sort(), [items])
  const channels = useMemo(() => [...new Set(items.map(r => r.ch))].filter(Boolean).sort(), [items])
  const hasItm   = items.some(r => r.itm)

  const baseFiltered = useMemo(() => items.filter(r =>
    (!filterCat || r.cat === filterCat) &&
    (!search    || (r.itm || r.cat || '').toLowerCase().includes(search.toLowerCase()))
  ), [items, filterCat, search])

  const chFiltered = useMemo(() => baseFiltered.filter(r =>
    !filterCh || r.ch === filterCh
  ), [baseFiltered, filterCh])

  const amtPivot = useMemo(() => {
    const map = {}
    baseFiltered.forEach(r => {
      const k = hasItm ? (r.itm || r.cat) : r.cat
      if (!map[k]) map[k] = { k, cat: r.cat, shops: {}, total: 0 }
      map[k].total += r.amt
      map[k].shops[r.sc] = (map[k].shops[r.sc] || 0) + r.amt
    })
    return Object.values(map).sort((a,b) => b.total - a.total).slice(0, 15)
  }, [baseFiltered, hasItm])

  const qtyPivot = useMemo(() => {
    const map = {}
    chFiltered.forEach(r => {
      const k = hasItm ? (r.itm || r.cat) : r.cat
      if (!map[k]) map[k] = { k, cat: r.cat, shops: {}, totalQty: 0 }
      map[k].totalQty += r.qty
      map[k].shops[r.sc] = (map[k].shops[r.sc] || 0) + r.qty
    })
    return Object.values(map).sort((a,b) => b.totalQty - a.totalQty).slice(0, 15)
  }, [chFiltered, hasItm])

  const branchTotalQty = useMemo(() => {
    const t = {}
    chFiltered.forEach(r => { t[r.sc] = (t[r.sc] || 0) + r.qty })
    return t
  }, [chFiltered])

  if (!shops.length) return null

  const selS = { padding: '5px 10px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 7, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }
  const thS  = (align = 'right') => ({ padding: '7px 10px', textAlign: align, color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap', fontSize: 11 })
  const tdS  = (align = 'right', extra = {}) => ({ padding: '6px 10px', textAlign: align, borderBottom: '1px solid var(--c-border)', fontSize: 11, ...extra })
  const catColor = (cat) => { const idx = categories.indexOf(cat); return ITEM_COLORS[idx >= 0 ? idx % ITEM_COLORS.length : 0] }

  return (
    <>
      {/* Shared filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 14px' }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selS}>
          <option value="">ทุก Category</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหารายการ..."
          style={{ ...selS, flex: 1, minWidth: 160, outline: 'none' }} />
        <select value={filterCh} onChange={e => setFilterCh(e.target.value)} style={selS}>
          <option value="">ทุกช่องทาง (สำหรับตารางบิล)</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table 1: ยอดขาย × สาขา */}
      <div style={card}>
        <SectionTitle>💰 ยอดขาย × สาขา (รายการ)</SectionTitle>
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={thS('left')}>Category</th>
                <th style={thS('left')}>รายการ</th>
                {shops.map(sc => <th key={sc} style={thS()}>{sc}</th>)}
                <th style={thS()}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {amtPivot.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={tdS('left')}>
                    <span style={{ background: catColor(row.cat)+'22', color: catColor(row.cat), border: `1px solid ${catColor(row.cat)}44`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.cat}</span>
                  </td>
                  <td style={{ ...tdS('left'), color: 'var(--c-text)', fontWeight: 600, maxWidth: 200 }}>{row.k}</td>
                  {shops.map(sc => (
                    <td key={sc} style={{ ...tdS(), color: row.shops[sc] ? '#10b981' : 'var(--c-muted)' }}>
                      {row.shops[sc] ? `฿${fmt(row.shops[sc])}` : '—'}
                    </td>
                  ))}
                  <td style={{ ...tdS(), color: '#f59e0b', fontWeight: 700 }}>฿{fmt(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table 2: จำนวน + % × สาขา */}
      <div style={card}>
        <SectionTitle>📦 จำนวน × สาขา (% ต่อบิลสาขา)</SectionTitle>
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={thS('left')}>Category</th>
                <th style={thS('left')}>รายการ</th>
                {shops.map(sc => (
                  <th key={sc} colSpan={2} style={{ ...thS(), textAlign: 'center', borderLeft: '1px solid var(--c-border)' }}>{sc}</th>
                ))}
                <th style={thS()}>รวม</th>
              </tr>
              <tr>
                <th style={thS('left')} /><th style={thS('left')} />
                {shops.map(sc => (
                  <>
                    <th key={sc+'q'} style={{ ...thS(), borderLeft: '1px solid var(--c-border)' }}>จำนวน</th>
                    <th key={sc+'p'} style={thS()}>%</th>
                  </>
                ))}
                <th style={thS()} />
              </tr>
            </thead>
            <tbody>
              {qtyPivot.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={tdS('left')}>
                    <span style={{ background: catColor(row.cat)+'22', color: catColor(row.cat), border: `1px solid ${catColor(row.cat)}44`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.cat}</span>
                  </td>
                  <td style={{ ...tdS('left'), color: 'var(--c-text)', fontWeight: 600, maxWidth: 200 }}>{row.k}</td>
                  {shops.map(sc => {
                    const q   = row.shops[sc] || 0
                    const tot = branchTotalQty[sc] || 0
                    const pct = tot > 0 ? q / tot * 100 : 0
                    return (
                      <>
                        <td key={sc+'q'} style={{ ...tdS(), borderLeft: '1px solid var(--c-border)', color: q ? 'var(--c-text)' : 'var(--c-muted)' }}>{q || '—'}</td>
                        <td key={sc+'p'} style={{ ...tdS(), color: pct > 5 ? '#f59e0b' : 'var(--c-muted)', fontSize: 10 }}>{pct > 0 ? pct.toFixed(1)+'%' : '—'}</td>
                      </>
                    )
                  })}
                  <td style={{ ...tdS(), color: '#8b5cf6', fontWeight: 700 }}>{fmt(row.totalQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Item MTD Tab ──────────────────────────────────────────────────────────
function ItemMTDTab({ items, categories, selCat, setSelCat }) {
  if (!items.length) return <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>ไม่มีข้อมูลในช่วงนี้</div>

  const catMap = {}
  items.forEach(r => {
    if (!catMap[r.cat]) catMap[r.cat] = { cat: r.cat, amt: 0, qty: 0 }
    catMap[r.cat].amt += r.amt
    catMap[r.cat].qty += r.qty
  })
  const totalAmt = items.reduce((s, r) => s + r.amt, 0)
  const top10 = Object.values(catMap).sort((a,b) => b.amt - a.amt).slice(0, 10)
  top10.forEach(c => { c.pct = totalAmt > 0 ? c.amt / totalAmt * 100 : 0 })

  const hourRows = selCat ? items.filter(r => r.cat === selCat) : items
  const catsInHour = [...new Set(hourRows.map(r => r.cat))].filter(Boolean).slice(0, 8)
  const catHourMap = {}
  hourRows.forEach(r => {
    if (!r.hr) return
    if (!catHourMap[r.hr]) catHourMap[r.hr] = { hr: r.hr }
    catHourMap[r.hr][r.cat] = (catHourMap[r.hr][r.cat] || 0) + r.amt
  })
  const catHourly = Object.values(catHourMap).sort((a,b) => a.hr.localeCompare(b.hr))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {[
          ['ยอดขายรวม',      `฿${fmt(totalAmt)}`,          '#10b981', '💰'],
          ['จำนวน Category', `${Object.keys(catMap).length} รายการ`, '#f59e0b', '🏷️'],
          ['Top Category',   top10[0]?.cat || '-',          '#8b5cf6', '🥇'],
          ['สัดส่วน Top 1',  top10[0] ? `${top10[0].pct.toFixed(2)}%` : '-', '#3b82f6', '📊'],
        ].map(([l, v, c, icon]) => (
          <div key={l} style={{ ...card, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 10, right: 14, fontSize: 24, opacity: 0.15 }}>{icon}</div>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Top 10 Category */}
      <div style={card}>
        <SectionTitle>Top 10 Category — ยอดขาย</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['#','Category','ยอดขาย','%','Qty'].map(h => (
                <th key={h} style={{ textAlign: h==='#'||h==='Category' ? 'left' : 'right', padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((d, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 700, width: 32 }}>{i+1}</td>
                <td style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: ITEM_COLORS[i % ITEM_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{d.cat}</span>
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(d.amt)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{d.pct.toFixed(2)}%</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{fmt(d.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hourly by Category */}
      {catHourly.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <SectionTitle>ยอดขายตามช่วงเวลา</SectionTitle>
            <select value={selCat} onChange={e => setSelCat(e.target.value)}
              style={{ padding: '6px 10px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit' }}>
              <option value="">ทุก Category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={catHourly} margin={{ top: 16, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
              <XAxis dataKey="hr" tick={{ fill: 'var(--c-muted)', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--c-muted)', paddingTop: 8 }} />
              {catsInHour.map((cat, i) => (
                <Bar key={cat} dataKey={cat} name={cat} fill={ITEM_COLORS[i % ITEM_COLORS.length]} stackId="a"
                  radius={i === catsInHour.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top 10 สินค้า */}
      {items.some(r => r.itm) && (() => {
        const itmMap = {}
        items.forEach(r => {
          const k = r.itm || '—'
          if (!itmMap[k]) itmMap[k] = { itm: k, cat: r.cat, amt: 0, qty: 0 }
          itmMap[k].amt += r.amt
          itmMap[k].qty += r.qty
        })
        const top10itm = Object.values(itmMap).sort((a,b) => b.amt - a.amt).slice(0, 10)
        top10itm.forEach(d => { d.pct = totalAmt > 0 ? d.amt / totalAmt * 100 : 0 })
        return (
          <div style={card}>
            <SectionTitle>Top 10 สินค้า — ยอดขาย</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['#','สินค้า','Category','ยอดขาย','%','Qty'].map(h => (
                    <th key={h} style={{ textAlign: h==='#'||h==='สินค้า'||h==='Category' ? 'left' : 'right', padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top10itm.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 700, width: 32 }}>{i+1}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--c-text)', fontWeight: 600, maxWidth: 220 }}>{d.itm}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ background: ITEM_COLORS[categories.indexOf(d.cat) % ITEM_COLORS.length] + '33', color: ITEM_COLORS[categories.indexOf(d.cat) % ITEM_COLORS.length], border: `1px solid ${ITEM_COLORS[categories.indexOf(d.cat) % ITEM_COLORS.length]}44`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{d.cat}</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(d.amt)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{d.pct.toFixed(2)}%</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{fmt(d.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* Branch pivot tables */}
      <ItemBranchPivot items={items} categories={categories} />

      {/* Detail table — grouped by category → item */}
      <ItemDetailTable items={items} totalAmt={totalAmt} categories={categories} />
    </div>
  )
}

// ─── Item Detail Table ─────────────────────────────────────────────────────
function ItemDetailTable({ items, totalAmt, categories }) {
  const [filterCat, setFilterCat] = useState('')
  const [search,    setSearch]    = useState('')
  const [sortKey,   setSortKey]   = useState('amt')
  const [sortAsc,   setSortAsc]   = useState(false)

  const toggleSort = key => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const rows = useMemo(() => {
    const map = {}
    const src = items.filter(r =>
      (!filterCat || r.cat === filterCat) &&
      (!search    || (r.itm || '').toLowerCase().includes(search.toLowerCase()) || r.cat.toLowerCase().includes(search.toLowerCase()))
    )
    src.forEach(r => {
      const key = `${r.cat}||${r.itm || '—'}`
      if (!map[key]) map[key] = { cat: r.cat, itm: r.itm || '—', amt: 0, qty: 0 }
      map[key].amt += r.amt
      map[key].qty += r.qty
    })
    const list = Object.values(map).map(r => ({ ...r, pct: totalAmt > 0 ? r.amt / totalAmt * 100 : 0 }))
    list.sort((a, b) => {
      const diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0)
      return sortAsc ? diff : -diff
    })
    return list
  }, [items, filterCat, search, sortKey, sortAsc, totalAmt])

  const hasItemNames = items.some(r => r.itm)

  const SortTh = ({ label, k, right }) => {
    const active = sortKey === k
    return (
      <th onClick={() => toggleSort(k)}
        style={{ padding: '8px 10px', textAlign: right ? 'right' : 'left', color: active ? '#3b82f6' : '#6b7280', fontWeight: 600, borderBottom: '1px solid #374151', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
        {label} {active ? (sortAsc ? '↑' : '↓') : '↕'}
      </th>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle>รายชื่อสินค้า ({rows.length.toLocaleString()} รายการ)</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '6px 10px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit' }}>
            <option value="">ทุก Category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..."
            style={{ padding: '6px 10px', background: 'var(--c-card-inner)', border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit', width: 160 }} />
        </div>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#111827', zIndex: 1 }}>
            <tr>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid #374151' }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left',  color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid #374151' }}>Category</th>
              {hasItemNames && <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid #374151' }}>ชื่อสินค้า</th>}
              <SortTh label="จำนวน" k="qty" right />
              <SortTh label="ยอดขาย" k="amt" right />
              <SortTh label="%" k="pct" right />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1f293755', background: i % 2 === 0 ? 'transparent' : '#ffffff05' }}>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)', fontSize: 11 }}>{i + 1}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ background: ITEM_COLORS[categories.indexOf(r.cat) % ITEM_COLORS.length] + '22', color: ITEM_COLORS[categories.indexOf(r.cat) % ITEM_COLORS.length], border: `1px solid ${ITEM_COLORS[categories.indexOf(r.cat) % ITEM_COLORS.length]}44`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                    {r.cat}
                  </span>
                </td>
                {hasItemNames && <td style={{ padding: '7px 10px', color: 'var(--c-text2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.itm}</td>}
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{r.qty > 0 ? fmtInt(r.qty) : '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(r.amt)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{r.pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Item Overview Tab ─────────────────────────────────────────────────────
function ItemOverviewTab({ items, categories, records }) {
  if (!items.length) return <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-muted)' }}>ไม่มีข้อมูล</div>

  const mMap = {}
  items.forEach(r => {
    const ym = r.dt.slice(0, 7)
    if (!mMap[ym]) mMap[ym] = { ym, amt: 0, qty: 0 }
    mMap[ym].amt += r.amt
    mMap[ym].qty += r.qty
  })
  const monthly = Object.values(mMap).sort((a,b) => a.ym.localeCompare(b.ym))

  const catMap = {}
  items.forEach(r => {
    if (!catMap[r.cat]) catMap[r.cat] = { cat: r.cat, amt: 0, qty: 0 }
    catMap[r.cat].amt += r.amt
    catMap[r.cat].qty += r.qty
  })
  const totalAmt = items.reduce((s, r) => s + r.amt, 0)
  const top10 = Object.values(catMap).sort((a,b) => b.amt - a.amt).slice(0, 10)
  top10.forEach(c => { c.pct = totalAmt > 0 ? c.amt / totalAmt * 100 : 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {[
          ['ยอดขายรวม',    `฿${fmt(totalAmt)}`,               '#10b981', '💰'],
          ['จำนวนเดือน',  `${monthly.length} เดือน`,          '#3b82f6', '📅'],
          ['Category',    `${Object.keys(catMap).length} รายการ`, '#f59e0b', '🏷️'],
          ['อันดับ 1',    top10[0]?.cat || '-',                '#8b5cf6', '🥇'],
        ].map(([l, v, c, icon]) => (
          <div key={l} style={{ ...card, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 10, right: 14, fontSize: 24, opacity: 0.15 }}>{icon}</div>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div style={card}>
        <SectionTitle>ยอดขายรายเดือน</SectionTitle>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly} margin={{ top: 46, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="ym"
              tickFormatter={v => { const [y,m] = v.split('-'); return `${MONTH_TH[+m]} ${(+y+543).toString().slice(-2)}` }}
              tick={{ fill: 'var(--c-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--c-muted)', fontSize: 10 }} tickFormatter={v => fmtBar(v)} domain={barDomain(monthly, 'amt')} />
            <Tooltip formatter={v => [`฿${fmt(v)}`, 'ยอดขาย']}
              labelFormatter={v => { const [y,m] = v.split('-'); return `${MONTH_TH[+m]} ${+y+543}` }}
              contentStyle={{ background: '#1f2937', border: '1px solid var(--c-border)', borderRadius: 8 }} />
            <Bar dataKey="amt" fill="#3b82f6" radius={[4,4,0,0]}>
              <LabelList content={({ x, y, width, value }) => (
                <text x={x+width/2} y={y-6} textAnchor="middle" style={{ fill: 'var(--c-text)' }} fontSize={10} fontWeight={700}>
                  {fmtBar(value)}
                </text>
              )} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 10 Category */}
      <div style={card}>
        <SectionTitle>Top 10 Category — ภาพรวม</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['#','Category','ยอดขาย','%','Qty'].map(h => (
                <th key={h} style={{ textAlign: h==='#'||h==='Category' ? 'left' : 'right', padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 600, borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((d, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '7px 10px', color: 'var(--c-muted)', fontWeight: 700, width: 32 }}>{i+1}</td>
                <td style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: ITEM_COLORS[i % ITEM_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{d.cat}</span>
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>฿{fmt(d.amt)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{d.pct.toFixed(2)}%</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--c-muted)' }}>{fmt(d.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail table */}
      <ItemDetailTable items={items} totalAmt={totalAmt} categories={[...new Set(items.map(r => r.cat))].filter(Boolean).sort()} />

      {/* Date pivot tables */}
      <ItemDatePivot items={items} categories={categories} records={records} />
    </div>
  )
}

const REPORT_TABS = [
  ['mtd',           '📅 MTD'],
  ['overview',      '📊 ภาพรวม'],
  ['channel',       '📡 แยกช่องทาง'],
  ['time',          '⏰ แยกเวลา'],
  ['detail',        '📋 รายละเอียด'],
  ['items_mtd',     '🛍️ รายการขาย'],
  ['items_overview','🛍️ ภาพรวมรายการขาย'],
]

export default function Report({ records, batches, targets, itemBatches, lightMode }) {
  const [tab, setTab]           = useState('mtd')
  const [filterShop, setFilterShop] = useState('all')
  const [filterMode, setFilterMode] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // ── Item report state ──
  const [colMap, setColMap]         = useState(() => {
    try { return JSON.parse(localStorage.getItem('itemColMap') || '{}') } catch { return {} }
  })
  const [showMapper, setShowMapper] = useState(false)
  const [selItemCat, setSelItemCat] = useState('')

  // Build shopMap from all batches
  const shopMap = useMemo(() => {
    const map = {}
    Object.values(batches || {}).forEach(b => {
      if (b.meta?.shopMap) {
        try { Object.assign(map, JSON.parse(b.meta.shopMap)) } catch {}
      }
    })
    return map
  }, [batches])

  const allShops  = useMemo(() => [...new Set(records.map(r => r.sc))].sort(), [records])
  const allModes  = useMemo(() => [...new Set(records.map(r => r.mo))].sort(), [records])
  const allYears  = useMemo(() => [...new Set(records.map(r => r.dt.slice(0,4)))].sort().reverse(), [records])
  const allMonths = useMemo(() => [...new Set(records.map(r => r.dt.slice(5,7)))].sort(), [records])

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (filterShop  !== 'all' && r.sc !== filterShop) return false
      if (filterMode  !== 'all' && r.mo !== filterMode) return false
      if (filterYear  !== 'all' && r.dt.slice(0,4) !== filterYear) return false
      if (filterMonth !== 'all' && r.dt.slice(5,7) !== filterMonth) return false
      if (dateFrom && r.dt < dateFrom) return false
      if (dateTo   && r.dt > dateTo)   return false
      return true
    })
  }, [records, filterShop, filterMode, filterYear, filterMonth, dateFrom, dateTo])

  // ── Item data ──
  const allItemColumns = useMemo(() => {
    const cols = new Set()
    Object.values(itemBatches || {}).forEach(b => {
      if (b.meta?.columns) b.meta.columns.split(',').forEach(c => cols.add(c.trim()))
    })
    return [...cols].sort()
  }, [itemBatches])

  const isMapped = !!(colMap.date && colMap.category && colMap.amount && colMap.shop)

  const allItems = useMemo(() => {
    if (!isMapped) return []
    return Object.values(itemBatches || {}).flatMap(b => {
      if (!b.data) return []
      return Object.values(b.data).map(r => ({
        dt:  normDate(String(r[colMap.date]     || '')),
        sc:  String(r[colMap.shop]              || '').trim(),
        cat: String(r[colMap.category]          || '').trim(),
        amt: parseFloat(String(r[colMap.amount] || '0').replace(/,/g,'')) || 0,
        qty: colMap.qty     ? (parseFloat(String(r[colMap.qty]     || '0').replace(/,/g,'')) || 0) : 0,
        ch:  colMap.channel ? String(r[colMap.channel] || '').trim() : '',
        hr:  colMap.hour    ? String(r[colMap.hour]    || '').trim() : '',
        itm: colMap.item    ? String(r[colMap.item]    || '').trim() : '',
      })).filter(r => r.dt && r.cat)
    })
  }, [itemBatches, colMap, isMapped])

  const itemFiltered = useMemo(() => allItems.filter(r => {
    if (filterShop  !== 'all' && r.sc !== filterShop)          return false
    if (filterMode  !== 'all' && r.ch && r.ch !== filterMode)  return false
    if (filterYear  !== 'all' && r.dt.slice(0,4) !== filterYear)  return false
    if (filterMonth !== 'all' && r.dt.slice(5,7) !== filterMonth) return false
    if (dateFrom && r.dt < dateFrom) return false
    if (dateTo   && r.dt > dateTo)   return false
    return true
  }), [allItems, filterShop, filterMode, filterYear, filterMonth, dateFrom, dateTo])

const itemCategories = useMemo(() => [...new Set(allItems.map(r => r.cat))].filter(Boolean).sort(), [allItems])

  const saveColMap = (draft) => {
    localStorage.setItem('itemColMap', JSON.stringify(draft))
    setColMap(draft)
    setShowMapper(false)
  }

  const monthTargets = useMemo(() => {
    const result = {}
    Object.entries(targets || {}).forEach(([ym, shopData]) => {
      let total = 0
      if (filterShop !== 'all') {
        const v = shopData[filterShop]
        total = typeof v === 'object' ? (v.total || 0) : (v || 0)
      } else {
        Object.entries(shopData).forEach(([sc, v]) => {
          if (sc !== 'all') total += typeof v === 'object' ? (v.total || 0) : (v || 0)
        })
      }
      if (total > 0) result[ym] = total
    })
    return result
  }, [targets, filterShop])

  if (!records.length) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <p style={{ color: 'var(--c-muted)', fontSize: 15 }}>ยังไม่มีข้อมูล</p>
        <p style={{ color: 'var(--c-muted)', fontSize: 13, marginTop: 4 }}>กรุณาอัพโหลดไฟล์ Excel ก่อน</p>
      </div>
    )
  }

  const selStyle = { padding: '7px 10px', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }
  const hasFilter = filterShop !== 'all' || filterMode !== 'all' || filterYear !== 'all' || filterMonth !== 'all' || dateFrom || dateTo
  const clearAll  = () => { setFilterShop('all'); setFilterMode('all'); setFilterYear('all'); setFilterMonth('all'); setDateFrom(''); setDateTo('') }

  // CSS vars for light/dark mode — set on wrapper, inherited by all children via CSS cascade
  const themeVars = lightMode ? {
    '--c-card':       '#ffffff',
    '--c-card-inner': '#f8fafc',
    '--c-border':     '#e2e8f0',
    '--c-text':       '#0f172a',
    '--c-text2':      '#374151',
    '--c-muted':      '#4b5563',
    '--c-surface':    '#e5e7eb',
  } : {
    '--c-card':       '#111827',
    '--c-card-inner': '#0a0f1a',
    '--c-border':     '#1f2937',
    '--c-text':       '#f1f5f9',
    '--c-text2':      '#d1d5db',
    '--c-muted':      '#9ca3af',
    '--c-surface':    '#374151',
  }

  return (
    <div style={themeVars}>
      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 14px' }}>
        <select value={filterYear}  onChange={e => setFilterYear(e.target.value)}  style={selStyle}>
          <option value="all">ทุกปี</option>
          {allYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={selStyle}>
          <option value="all">ทุกเดือน</option>
          {allMonths.map(m => <option key={m} value={m}>{MONTH_TH[parseInt(m)]}</option>)}
        </select>
        <select value={filterShop}  onChange={e => setFilterShop(e.target.value)}  style={selStyle}>
          <option value="all">ทุกสาขา</option>
          {allShops.map(s => <option key={s} value={s}>{s} — {shopMap[s] || ''}</option>)}
        </select>
        <select value={filterMode}  onChange={e => setFilterMode(e.target.value)}  style={selStyle}>
          <option value="all">ทุกช่องทาง</option>
          {allModes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...selStyle, cursor: 'auto' }} />
        <span style={{ color: 'var(--c-muted)', fontSize: 12 }}>–</span>
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ ...selStyle, cursor: 'auto' }} />
        {hasFilter && (
          <button onClick={clearAll} style={{ background: '#374151', border: 'none', color: 'var(--c-muted)', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            ล้าง
          </button>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--c-muted)', fontSize: 11 }}>{filtered.length.toLocaleString()} รายการ</span>
      </div>

      {/* ── Sub tabs ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {REPORT_TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={subTab(tab === k)}>{label}</button>
        ))}
        {(tab === 'items_mtd' || tab === 'items_overview') && isMapped && !showMapper && (
          <button onClick={() => setShowMapper(true)}
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-muted)', borderRadius: 6, padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            title="ตั้งค่าคอลัมน์">
            ⚙️
          </button>
        )}
      </div>

      {/* Content */}
      {tab === 'overview' && <OverviewTab records={filtered} monthTargets={monthTargets} lightMode={lightMode} />}
      {tab === 'mtd'      && <MTDTab records={filtered} allRecords={records.filter(r => (filterShop === 'all' || r.sc === filterShop) && (filterMode === 'all' || r.mo === filterMode))} targets={targets} monthTargets={monthTargets} />}

      {tab === 'channel'  && <ByChannelTab records={filtered} shopMap={shopMap} />}
      {tab === 'time'     && <ByTimeTab records={filtered} />}
      {tab === 'detail'   && <DetailsTab records={filtered} shopMap={shopMap} />}

      {(tab === 'items_mtd' || tab === 'items_overview') && (
        <div>
          {/* Column mapper toggle */}
          {(showMapper || !isMapped) && (
            <ItemColMapper allColumns={allItemColumns} colMap={colMap} onSave={saveColMap} />
          )}
          {isMapped && !showMapper && tab === 'items_mtd' && (
            <ItemMTDTab items={itemFiltered} categories={itemCategories} selCat={selItemCat} setSelCat={setSelItemCat} />
          )}
          {isMapped && !showMapper && tab === 'items_overview' && (
            <ItemOverviewTab items={itemFiltered} categories={itemCategories} records={filtered} />
          )}
        </div>
      )}
    </div>
  )
}
