import { useEffect, useState } from 'react'
import { supabase, fmtDate } from '../supabase'
import { Section, Spinner, Th, Td } from '../components/ui'

const PAGE = 100
const STATUS_OPTS = [
  { v: '', label: 'Todos os status' },
  { v: '1', label: 'Pendente de avaliação' },
  { v: '4', label: 'Finalizada' },
  { v: '12', label: 'Atendida sem prescrição (12)' },
  { v: '13', label: 'Atendida sem prescrição (13)' },
]

export default function Consultas() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('1')
  const [tipo, setTipo] = useState('')
  const [tipos, setTipos] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('v_dash_consultas').select('tipo_consulta').limit(1000).then(({ data }) => {
      setTipos([...new Set((data || []).map((d) => d.tipo_consulta))].sort())
    })
  }, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    async function load() {
      let q = supabase
        .from('v_dash_consultas')
        .select('*', { count: 'exact' })
        .order('request_date', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (status) q = q.eq('status', Number(status))
      if (tipo) q = q.eq('tipo_consulta', tipo)
      if (search.trim()) {
        // busca varre todo o histórico; sem busca, restringe a 2026
        const s = search.trim()
        q = q.or(`paciente_nome.ilike.%${s}%,paciente_cpf.ilike.%${s}%,paciente_email.ilike.%${s}%,paciente_telefone.ilike.%${s}%`)
      } else {
        q = q.gte('request_date', '2026-01-01')
      }
      const { data, count } = await q
      if (!alive) return
      setRows(data || [])
      setTotal(count || 0)
    }
    load()
    return () => { alive = false }
  }, [page, status, tipo, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Consultas Médicas</h1>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Buscar nome, CPF, e-mail ou telefone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(0) }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Todos os tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <Section title={`${total.toLocaleString('pt-BR')} consultas`}>
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Solicitada</Th><Th>Atendida</Th><Th>Código</Th><Th>Paciente</Th><Th>CPF</Th>
                  <Th>Status</Th><Th>Tipo</Th><Th>Médico</Th><Th>Prescrição</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{fmtDate(r.request_date)}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.attend_date)}</Td>
                    <Td>#{r.appointment_code}</Td>
                    <Td>{r.paciente_nome || '—'}</Td>
                    <Td className="whitespace-nowrap">{r.paciente_cpf || '—'}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === 4 ? 'bg-emerald-100 text-emerald-700'
                        : r.status === 1 ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>{r.status_label}</span>
                    </Td>
                    <Td>{r.tipo_consulta}</Td>
                    <Td>{r.medico_nome || '—'}</Td>
                    <Td className="max-w-xs truncate" title={r.prescription_products_list}>{r.prescription_products_list || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 disabled:opacity-40">← Anterior</button>
          <span>Página {page + 1} de {Math.max(1, Math.ceil(total / PAGE))}</span>
          <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 disabled:opacity-40">Próxima →</button>
        </div>
      </Section>
    </div>
  )
}
