import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined — ещё загружаем
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        setError(e.message)
        setUser(null)
      })
  }, [])

  const value = {
    user,
    error,
    setUser,
    isStaff: user?.role === 'admin' || user?.role === 'teacher',
    async logout() {
      await api.post('/api/auth/logout')
      setUser(null)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
