import { useState } from 'react'
import { ref, remove } from 'firebase/database'
import { db } from '../firebase'
import { fmt, fmtDate } from '../utils'

const S = {
  card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, marginBottom: 12 },
  btn: (color) => ({
    background: color, color: '#fff', border: 'none', borderRadius: 7,
    padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  badge: (color) => ({
    background: color + '22', color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
  }),
}

function ConfirmModal({ batch, onConfirm, onCancel }) {
  if (!batch) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ background: '#1f2937', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
        <p style={{ fontSize: 20, marginBottom: 8 }}>🗑️</p>
        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>ยืนยันการลบ?</p>
        <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
          ลบ <span style={{ color: '#f87171', fontWeight: 600 }}>{batch.meta?.filename}</span><br />
          ({(batch.meta?.recordCount || 0).toLocaleString()} รายการ) จะถูกลบออกจาก Firebase ถาวร
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onConfirm} style={{ ...S.btn('#ef4444'), flex: 1 }}>ลบเลย</button>
          <button onClick={onCancel}  style={{ ...S.btn('#374151'), flex: 1 }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}

export default function Batches({ batches }) {
  const [confirmId, setConfirmId] = useState(null)
  const [deleting, setDeleting]   = useState(null)

  const entries = Object.entries(batches || {})
    .sort((a, b) => (b[1].meta?.uploadedAt || '') > (a[1].meta?.uploadedAt || '') ? 1 : -1)

  const doDelete = async id => {
    setDeleting(id)
    try {
      await remove(ref(db, `tx_batches/${id}`))
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  if (!entries.length) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <p style={{ color: '#6b7280', fontSize: 15 }}>ยังไม่มีข้อมูลที่อัพโหลด</p>
        <p style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>ไปที่แท็บ "อัพโหลด" เพื่อเพิ่มข้อมูล</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>จัดการข้อมูลที่อัพโหลด</h2>
        <span style={S.badge('#3b82f6')}>{entries.length} batch</span>
      </div>

      {entries.map(([id, batch]) => {
        const m = batch.meta || {}
        const shops = m.shops ? m.shops.split(',') : []
        const modes = m.modes ? m.modes.split(',') : []
        const totalBS = batch.data
          ? Object.values(batch.data).reduce((s, r) => s + (r.bs || 0), 0)
          : 0

        return (
          <div key={id} style={S.card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>📄 {m.filename || id}</p>
                  <span style={S.badge('#10b981')}>{(m.recordCount || 0).toLocaleString()} รายการ</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>อัพโหลดเมื่อ</p>
                    <p style={{ fontSize: 13, color: '#d1d5db' }}>{fmtDate(m.uploadedAt)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>ช่วงข้อมูล</p>
                    <p style={{ fontSize: 13, color: '#d1d5db' }}>{m.dateFrom} → {m.dateTo}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>Base Sales รวม</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>฿{fmt(totalBS)}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {shops.map(s => <span key={s} style={S.badge('#3b82f6')}>{s}</span>)}
                  {modes.slice(0, 5).map(mo => <span key={mo} style={S.badge('#8b5cf6')}>{mo}</span>)}
                  {modes.length > 5 && <span style={S.badge('#6b7280')}>+{modes.length - 5} อื่นๆ</span>}
                </div>
              </div>
              <button
                onClick={() => setConfirmId(id)}
                disabled={deleting === id}
                style={{ ...S.btn('#ef4444'), opacity: deleting === id ? 0.6 : 1, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
              >
                {deleting === id ? '⏳' : '🗑️ ลบ'}
              </button>
            </div>
          </div>
        )
      })}

      {confirmId && (
        <ConfirmModal
          batch={batches[confirmId]}
          onConfirm={() => doDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
