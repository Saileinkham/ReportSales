import { useState, useEffect } from 'react'
import { onValue, ref } from 'firebase/database'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import { normDate } from './utils'
import Upload from './pages/Upload'
import Batches from './pages/Batches'
import Report from './pages/Report'
import Target from './pages/Target'
import ItemUpload from './pages/ItemUpload'
import ItemBatches from './pages/ItemBatches'
import Login from './pages/Login'

const TABS = [
  ['report',         '📊', 'รายงาน'],
  ['target',         '🎯', 'ตั้งเป้า'],
  ['upload',         '📤', 'อัพโหลด'],
  ['batches',        '📦', 'จัดการข้อมูล'],
  ['items_upload',   '📤', 'นำเข้ารายการขาย'],
  ['items_batches',  '🗂️', 'จัดการรายการขาย'],
]

export default function App() {
  const [tab, setTab]               = useState('report')
  const [batches, setBatches]       = useState({})
  const [targets, setTargets]       = useState({})
  const [itemBatches, setItemBatches] = useState({})
  const [loading, setLoading]       = useState(true)
  const [noConfig, setNoConfig]     = useState(false)
  const [navOpen, setNavOpen]       = useState(false)
  const [lightMode, setLightMode]   = useState(false)
  const [user, setUser]             = useState(undefined) // undefined = checking, null = not logged in

  useEffect(() => {
    if (!auth) { setUser(null); return }
    return onAuthStateChanged(auth, u => setUser(u ?? null))
  }, [])

  useEffect(() => {
    if (!user || !db) { setLoading(false); if (!db) setNoConfig(true); return }
    // Timeout fallback — ถ้า Firebase ไม่ตอบใน 10 วิ ให้โหลดต่อได้เลย
    const timeout = setTimeout(() => setLoading(false), 10000)
    const unsub1 = onValue(ref(db, 'tx_batches'),
      snap => { setBatches(snap.val() || {}); setLoading(false); clearTimeout(timeout) },
      ()   => { setLoading(false); clearTimeout(timeout) }
    )
    const unsub2 = onValue(ref(db, 'targets'),
      snap => setTargets(snap.val() || {}),
      () => {}
    )
    const unsub3 = onValue(ref(db, 'item_batches'),
      snap => setItemBatches(snap.val() || {}),
      () => {}
    )
    return () => { unsub1(); unsub2(); unsub3(); clearTimeout(timeout) }
  }, [user])

  const allRecords = Object.values(batches).flatMap(b =>
    b.data ? Object.values(b.data).map(r => ({ ...r, dt: normDate(r.dt) })) : []
  )
  const allShops = [...new Set(allRecords.map(r => r.sc))].sort()
  const shopMap  = {}
  Object.values(batches).forEach(b => {
    if (b.meta?.shopMap) { try { Object.assign(shopMap, JSON.parse(b.meta.shopMap)) } catch {} }
  })

  const selectTab = k => { setTab(k); setNavOpen(false) }

  if (user === undefined) return null
  if (!user) return <Login />

  const lm = lightMode
  return (
    <div style={{ minHeight: '100vh', background: lm ? '#f1f5f9' : '#0a0f1a', color: lm ? '#0f172a' : '#f1f5f9', fontFamily: "'Sarabun', sans-serif" }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: lm ? 'rgba(255,255,255,0.92)' : '#111827dd', backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${lm ? '#e2e8f0' : '#1f2937'}`,
        padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, height: 56,
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setNavOpen(o => !o)}
          style={{
            background: navOpen ? '#1e3a5f' : 'transparent',
            border: navOpen ? '1px solid #3b82f660' : '1px solid transparent',
            color: navOpen ? '#3b82f6' : '#9ca3af',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
            fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
          }}
          title="เมนู"
        >☰</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <p style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', lineHeight: 1 }}>Report Sale</p>
            <p style={{ fontSize: 10, color: '#6b7280', lineHeight: 1, marginTop: 2 }}>Transaction Analytics</p>
          </div>
        </div>

        {/* Light mode toggle */}
        <button
          onClick={() => setLightMode(v => !v)}
          style={{
            marginLeft: 'auto',
            background: lm ? '#f1f5f9' : '#1f2937',
            border: `1px solid ${lm ? '#cbd5e1' : '#374151'}`,
            color: lm ? '#0f172a' : '#9ca3af',
            borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
          }}
          title={lm ? 'โหมดกลางคืน' : 'โหมดกลางวัน'}
        >{lm ? '🌙' : '☀️'}</button>

        {/* Sign out */}
        <button
          onClick={() => signOut(auth)}
          style={{
            background: 'transparent', border: '1px solid #374151',
            color: '#6b7280', borderRadius: 8, padding: '5px 10px',
            cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}
          title={user?.email}
        >ออกจากระบบ</button>

        {/* Active tab label */}
        <span style={{ color: '#6b7280', fontSize: 13 }}>
          {TABS.find(([k]) => k === tab)?.[0] && (
            <>{TABS.find(([k]) => k === tab)[1]} {TABS.find(([k]) => k === tab)[2]}</>
          )}
        </span>
      </header>

      {/* ── Nav Sidebar overlay ── */}
      {navOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#00000066' }}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside style={{
        position: 'fixed', top: 56, left: 0, bottom: 0, zIndex: 45,
        width: 220,
        background: lm ? '#ffffff' : '#111827', borderRight: `1px solid ${lm ? '#e2e8f0' : '#1f2937'}`,
        padding: '20px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
        transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .22s ease',
      }}>
        <p style={{ fontSize: 11, color: '#4b5563', fontWeight: 600, marginBottom: 8, paddingLeft: 8 }}>เมนูหลัก</p>
        {allRecords.length > 0 && (
          <div style={{ background: '#10b98111', border: '1px solid #10b98133', borderRadius: 8, padding: '7px 12px', marginBottom: 4 }}>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>ข้อมูลยอดขาย</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{allRecords.length.toLocaleString()} records</p>
          </div>
        )}
        {Object.keys(itemBatches).length > 0 && (
          <div style={{ background: '#3b82f611', border: '1px solid #3b82f633', borderRadius: 8, padding: '7px 12px', marginBottom: 4 }}>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>รายการขาย</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{Object.keys(itemBatches).length} ชุดข้อมูล</p>
          </div>
        )}
        {TABS.map(([k, icon, label]) => (
          <button
            key={k}
            onClick={() => selectTab(k)}
            style={{
              background: tab === k ? '#1e3a5f' : 'transparent',
              border: tab === k ? '1px solid #3b82f660' : '1px solid transparent',
              color: tab === k ? '#3b82f6' : '#9ca3af',
              borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === k ? 700 : 500,
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'inherit', textAlign: 'left', width: '100%',
              transition: 'all .15s',
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span> {label}
          </button>
        ))}
      </aside>

      {/* ── Main ── */}
      <main style={{ padding: '24px 24px 80px', maxWidth: 1400, margin: '0 auto' }}>
        {noConfig && (
          <div style={{
            background: '#78350f22', border: '1px solid #f59e0b44', borderRadius: 12,
            padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <p style={{ fontWeight: 700, color: '#fcd34d', marginBottom: 4 }}>ยังไม่ได้ตั้งค่า Firebase</p>
              <p style={{ fontSize: 13, color: '#d97706' }}>
                สร้างไฟล์ <code style={{ background: '#1f2937', padding: '1px 6px', borderRadius: 4 }}>.env</code> จากไฟล์ <code style={{ background: '#1f2937', padding: '1px 6px', borderRadius: 4 }}>.env.example</code> แล้วใส่ค่า Firebase config
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{ color: '#6b7280' }}>กำลังโหลดข้อมูลจาก Firebase...</p>
          </div>
        ) : (
          <>
            {tab === 'upload'        && <Upload      onUploaded={() => setTab('report')} />}
            {tab === 'batches'       && <Batches     batches={batches} />}
            {tab === 'target'        && <Target      targets={targets} allShops={allShops} shopMap={shopMap} />}
            {tab === 'report'        && <Report      records={allRecords} batches={batches} targets={targets} itemBatches={itemBatches} lightMode={lightMode} />}
            {tab === 'items_upload'  && <ItemUpload  onUploaded={() => setTab('items_batches')} />}
            {tab === 'items_batches' && <ItemBatches batches={itemBatches} />}
          </>
        )}
      </main>
    </div>
  )
}
