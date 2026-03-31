import { getApp, getApps, initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasAllConfig = Object.values(firebaseConfig).every(
  v => typeof v === 'string' && v.trim().length > 0
)

function getOrInitApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig)
}

export const db = (() => {
  if (!hasAllConfig) return null
  try { return getDatabase(getOrInitApp()) } catch { return null }
})()

export const auth = (() => {
  if (!hasAllConfig) return null
  try { return getAuth(getOrInitApp()) } catch { return null }
})()
