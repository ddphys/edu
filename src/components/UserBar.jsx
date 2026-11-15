import { Link } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

export default function UserBar() {
  const { user, isStaff, logout } = useAuth()
  if (!user) return null
  return (
    <div className="userbar">
      <Link to="/" className="userbar__home">Мои курсы</Link>
      <span className="userbar__right">
        {isStaff && <Link to="/admin">Кабинет преподавателя</Link>}
        <Link to="/account">
          {user.firstName} {user.lastName}
        </Link>
        <button className="link" onClick={logout}>Выйти</button>
      </span>
    </div>
  )
}
