export function Card({ title, value, sub, accent }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className={`mt-1 text-3xl font-bold ${accent || 'text-ink-900'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

export function Section({ title, children, right }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  )
}

export function BarList({ items, fmt }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-2">
      {items.length === 0 && <div className="text-sm text-slate-400">Sem dados no período.</div>}
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-0.5 flex justify-between text-sm">
            <span className="truncate text-slate-600">{i.label}</span>
            <span className="ml-2 font-semibold text-ink-900">{fmt ? fmt(i.value) : i.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Spinner() {
  return <div className="py-12 text-center text-slate-400">Carregando…</div>
}

export function Th({ children }) {
  return <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
}

export function Td({ children, className = '' }) {
  return <td className={`border-b border-slate-100 px-3 py-2 text-sm ${className}`}>{children}</td>
}
