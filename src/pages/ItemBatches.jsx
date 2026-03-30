import { useState } from 'react'
import { ref, remove } from 'firebase/database'
import { db } from '../firebase'

const S = {
  card: { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 },
  btn: (color = '#3b82f6') => ({
    background: color, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'opacity .15s',
  }),
  tag: (color) => ({
    background: color + '22', color, border: `1px solid ${color}44`,
    borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
  }),
}

export default function ItemBatches({ batches }) {
  const [deleting, setDeleting]   = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const batchList = Object.entries(batches || {})
    .sort((a, b) => (b[1].meta?.uploadedAt || '') > (a[1].meta?.uploadedAt || '') ? 1 : -1)

  const doDelete = async id => {
    setDeleting(id)
    try {
      await remove(ref(db, `item_batches/${id}`))
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>จัดการรายการขาย</h2>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            ข้อมูลที่นำเข้าแล้ว {batchList.length} ชุด
          </p>
        </div>
      </div>

      {batchList.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: '#6b7280', fontSize: 15 }}>ยังไม่มีข้อมูลรายการขายที่นำเข้า</p>
          <p style={{ color: '#4b5563', fontSize: 13, marginTop: 6 }}>ไปที่ "นำเข้ารายการขาย" เพื่ออัพโหลดไฟล์</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {batchList.map(([id, batch]) => {
            const m = batch.meta || {}
            const cols = m.columns ? m.columns.split(',') : []
            const isConfirm = confirmId === id
            const isDeleting = deleting === id

            return (
              <div key={id} style={S.card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', wordBreak: 'break-all' }}>
                        📋 {m.filename || id}
                      </span>
                      <span style={S.tag('#10b981')}>
                        {(m.recordCount || 0).toLocaleString()} รายการ
                      </span>
                      <span style={S.tag('#6b7280')}>
                        {cols.length} คอลัมน์
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
                      {[
                        ['อัพโหลดเมื่อ', m.uploadedAt ? new Date(m.uploadedAt).toLocaleString('th-TH') : '-'],
                        ...(m.dateFrom ? [['ตั้งแต่', m.dateFrom]] : []),
                        ...(m.dateTo   ? [['ถึง',     m.dateTo]]   : []),
                        ...(m.dateCol  ? [['คอลัมน์วันที่', m.dateCol]] : []),
                      ].map(([l, v]) => (
                        <div key={l} style={{ background: '#0a0f1a', borderRadius: 6, padding: '7px 10px' }}>
                          <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{l}</p>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#d1d5db', wordBreak: 'break-all' }}>{v}</p>
                        </div>
                      ))}
                    </div>

                    {cols.length > 0 && (
                      <div>
                        <p style={{ fontSize: 11, color: '#4b5563', marginBottom: 6 }}>คอลัมน์:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {cols.map(c => (
                            <span key={c} style={S.tag('#3b82f6')}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    {!isConfirm ? (
                      <button
                        onClick={() => setConfirmId(id)}
                        style={{ ...S.btn('#7f1d1d'), background: '#7f1d1d', border: '1px solid #ef444444' }}
                      >
                        🗑️ ลบ
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <p style={{ fontSize: 12, color: '#fca5a5', textAlign: 'right', maxWidth: 140 }}>
                          ยืนยันลบข้อมูลชุดนี้?
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setConfirmId(null)}
                            style={{ ...S.btn('#374151'), padding: '6px 14px' }}
                          >
                            ยกเลิก
                          </button>
                          <button
                            onClick={() => doDelete(id)}
                            disabled={isDeleting}
                            style={{ ...S.btn('#dc2626'), padding: '6px 14px', opacity: isDeleting ? 0.6 : 1 }}
                          >
                            {isDeleting ? '⏳' : 'ยืนยัน'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
