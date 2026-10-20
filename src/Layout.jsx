import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../supabase'
import NovaVersao from './NovaVersao'

const items = [
  { to: '/', label: 'Overview', icon: '📊' },
  { to: '/cliente', label: 'Cliente', icon: '👤' },
  { to: '/pedidos', label: 'Breakdown Pedidos 2026', icon: '🛒' },
  { to: '/consultas', label: 'Consultas Médicas', icon: '🩺' },
  { to: '/avaliacoes', label: 'Avaliações', icon: '📝' },
  { to: '/rastreios', label: 'Rastreios', icon: '📦' },
  { to: '/status-pedidos', label: 'Status Pedidos', icon: '✅' },
  { to: '/frete-expresso', label: 'Frete Expresso', icon: '🚀' },
  { to: '/validacao', label: 'Validação Tiny', icon: '💊' },
  { to: '/glp1', label: 'GLP1', icon: '💉' },
  { to: '/glp1-fiscal', label: 'GLP1 - Fiscal', icon: '🧾' },
  { to: '/glp1-gollog', label: 'GLP1 - Gollog', icon: '✈️' },
  { to: '/glp1-etiquetas', label: 'GLP1 - Etiquetas', icon: '🏷️' },
  { to: '/check-cpf', label: 'Check CPF', icon: '🪪' },
]

// Papel 'glp1' só vê as abas GLP1
const SO_GLP1 = ['/glp1', '/glp1-fiscal', '/glp1-gollog', '/glp1-etiquetas']

export default function Layout({ email, master, papel, children }) {
  // Ao começar a arrastar dentro de uma célula, trava a seleção naquela coluna (ex.: copiar só os nº de pedido)
  useEffect(() => {
    const aoPressionar = (e) => {
      document.querySelectorAll('table[data-col-sel]').forEach((t) => {
        if (!t.contains(e.target)) t.removeAttribute('data-col-sel')
      })
      const td = e.target.closest?.('td')
      const tabela = td?.closest('table')
      if (!td || !tabela || e.target.closest('input, select, button, textarea, a')) return
      tabela.setAttribute('data-col-sel', String(td.cellIndex + 1))
    }
    // Ctrl+C copia só a coluna travada, uma linha por célula
    const aoCopiar = (e) => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const tabela = document.querySelector('table[data-col-sel]')
      if (!tabela || !sel.containsNode(tabela, true)) return
      const col = Number(tabela.getAttribute('data-col-sel')) - 1
      const textos = [...tabela.tBodies].flatMap((tb) => [...tb.rows])
        .map((tr) => tr.cells[col])
        .filter((td) => td && sel.containsNode(td, true))
        .map((td) => td.innerText.trim())
        .filter(Boolean)
      if (!textos.length) return
      e.clipboardData.setData('text/plain', textos.join('\n'))
      e.preventDefault()
    }
    document.addEventListener('mousedown', aoPressionar)
    document.addEventListener('copy', aoCopiar)
    return () => {
      document.removeEventListener('mousedown', aoPressionar)
      document.removeEventListener('copy', aoCopiar)
    }
  }, [])

  const visiveis = papel === 'glp1' ? items.filter((it) => SO_GLP1.includes(it.to)) : items
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-ink-900 text-slate-200">
        <div className="px-6 py-6">
          <div className="text-xl font-bold tracking-tight text-white">The Mens</div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Dashboard</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {[...visiveis, ...(master ? [{ to: '/usuarios', label: 'Usuários', icon: '🔐' }] : [])].map((it) => (
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
      <main className="flex-1 overflow-x-auto p-8">
        <NovaVersao />
        {children}
      </main>
    </div>
  )
}
