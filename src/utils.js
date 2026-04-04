export const fmt = n => {
  if (n === null || n === undefined || isNaN(n)) return '0'
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export const fmtInt = n => Number(n || 0).toLocaleString('th-TH')

// Normalize dd/mm/yyyy → yyyy-mm-dd (handles existing Firebase data)
export const normDate = s => {
  if (!s) return ''
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s).trim())) {
    const [dd, mm, yyyy] = String(s).trim().split('/')
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
  }
  return String(s).slice(0, 10)
}

export const fmtDate = s => {
  if (!s) return ''
  const iso = normDate(s)
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtDateShort = s => {
  if (!s) return ''
  const iso = normDate(s)
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export const SHOP_COLORS = {
  B011: '#3b82f6',
  B012: '#10b981',
  B016: '#f59e0b',
  B018: '#ef4444',
  B024: '#8b5cf6',
  B046: '#ec4899',
}

export const MODE_COLORS = {
  'DINE IN':      '#3b82f6',
  'Grab food':    '#10b981',
  'Line man':     '#22c55e',
  'OKJ DV':       '#f59e0b',
  'Order Pickup': '#8b5cf6',
  'Robinhood':    '#ef4444',
  'Shopee food':  '#f97316',
  'Sook':         '#06b6d4',
  'TAKE AWAY':    '#64748b',
}

const FALLBACK = ['#a78bfa','#fb923c','#34d399','#f472b6','#38bdf8','#fbbf24']
export const getShopColor = (code, idx) => SHOP_COLORS[code] || FALLBACK[idx % FALLBACK.length]
export const getModeColor = (mode, idx) => MODE_COLORS[mode] || FALLBACK[idx % FALLBACK.length]

export const sortPeriods = periods =>
  [...periods].sort((a, b) => {
    const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
    return toMin(a.split('-')[0]) - toMin(b.split('-')[0])
  })

export const COL_MAP = {
  'Shop Code':      'sc',
  'Shop Name':      'sn', // kept for shopMap building only, stripped before upload
  'EntDate':        'dt',
  'Mode':           'mo',
  'Period':         'pd',
  'Bill Count':     'bc',
  'Cust Count':     'cc',
  'Base Sales':     'bs',
  'Discount':       'dc',
  'Service Charge': 'sv',
}

export const toYMD = d => {
  if (!d) return ''
  if (typeof d === 'string') {
    // dd/mm/yyyy → yyyy-mm-dd
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d.trim())) {
      const [dd, mm, yyyy] = d.trim().split('/')
      return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
    }
    return d.slice(0, 10)
  }
  if (d instanceof Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (typeof d === 'number') {
    const date = new Date((d - 25569) * 86400 * 1000)
    return toYMD(date)
  }
  return String(d).slice(0, 10)
}
