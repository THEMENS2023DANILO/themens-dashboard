import { todaySP } from '../supabase'

function shiftDays(base, days) {
  const d = new Date(`${base}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function DateRange({ from, to, onChange }) {
  const today = todaySP()
  const presets = [
    { label: 'Hoje', from: today, to: today },
    { label: 'Ontem', from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { label: '7 dias', from: shiftDays(today, -6), to: today },
    { label: '30 dias', from: shiftDays(today, -29), to: today },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange(p.from, p.to)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            from === p.from && to === p.to
              ? 'bg-brand-600 text-white'
              : 'bg-white text-slate-600 shadow-sm hover:bg-slate-50'
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="ml-2 flex items-center gap-1 text-sm">
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => onChange(e.target.value, to)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
        />
        <span className="text-slate-400">até</span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => onChange(from, e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
        />
      </div>
    </div>
  )
}
