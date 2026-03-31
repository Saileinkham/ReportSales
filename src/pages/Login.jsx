import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!auth) return
    setError(''); setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const msg = {
        'auth/invalid-credential':    'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
        'auth/user-not-found':        'ไม่พบบัญชีผู้ใช้นี้',
        'auth/wrong-password':        'รหัสผ่านไม่ถูกต้อง',
        'auth/too-many-requests':     'ลองใหม่อีกครั้งในภายหลัง',
        'auth/invalid-email':         'รูปแบบอีเมลไม่ถูกต้อง',
      }[err.code] || 'เข้าสู่ระบบไม่สำเร็จ'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const inp = {
    width: '100%', padding: '10px 14px', background: '#111827',
    border: '1px solid #374151', borderRadius: 8, color: '#f1f5f9',
    fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0f1a', fontFamily: "'Sarabun', sans-serif",
    }}>
      <div style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 16,
        padding: '40px 36px', width: '100%', maxWidth: 380,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
          <p style={{ fontWeight: 800, fontSize: 20, color: '#f1f5f9' }}>Report Sale</p>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Transaction Analytics</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>อีเมล</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com" required autoComplete="email"
              style={inp}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>รหัสผ่าน</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
              style={inp}
            />
          </div>

          {error && (
            <div style={{ background: '#7f1d1d22', border: '1px solid #ef444444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              background: loading ? '#1e3a5f' : '#3b82f6', color: '#fff', border: 'none',
              borderRadius: 8, padding: '11px', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              marginTop: 4, opacity: loading ? 0.7 : 1, transition: 'all .15s',
            }}
          >
            {loading ? '⏳ กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
