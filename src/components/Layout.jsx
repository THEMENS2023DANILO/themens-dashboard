import { NavLink } from 'react-router-dom'
import { supabase } from '../supabase'

const items = [
  { to: '/', label: 'Overview', icon: '📊' },
  { to: '/cliente', label: 'Cliente', icon: '👤' },
  { to: '/pedidos', label: 'Breakdown Pedidos 2026', icon: '🛒' },
  { to: '/consultas', label: 'Consultas Médicas', icon: '🩺' },
  { to: '/rastreios', label: 'Rastreios', icon: '📦' },
  { to: '/status-pedidos', label: 'Status Pedidos', icon: '✅' },
  { to: '/frete-expresso', label: 'Frete Expresso', icon: '🚀' },
]

export default function Layout({ email, children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-ink-900 text-slate-200">
        <div className="px-6 py-6">
          <div className="text-xl font-bold tracking-tight text-white">The Mens</div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Dashboard</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-ink-800 hover:text-white'
                }`
              }
            >
              <span>{it.icon}</span>
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-800 px-6 py-4 text-xs text-slate-400">
          <div className="truncate">{email}</div>
          <button onClick={() => supabase.auth.signOut()} className="mt-2 text-slate-300 underline hover:text-white">
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  )
}
