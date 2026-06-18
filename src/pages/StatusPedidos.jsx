import { useEffect, useState } from 'react'
import { supabase, fmtBRL, fmtDate } from '../supabase'
import { Section, Spinner, Th, Td, Card } from '../components/ui'

const PAGE = 100

function TriFilter({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="mr-1 text-slate-500">{label}:</span>
      {[['', 'Todos'], ['sim', 'Tem'], ['nao', 'Não tem']].map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            value === v ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-50'
          }`}
        >{l}</button>
      ))}
    </div>
  )
}

export default function StatusPedidos() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [fConsulta, setFConsulta] = useState('')
  const [fRastreio, setFRastreio] = useState('')
  const [fValidacao, setFValidacao] = useState('')
  const [search, setSearch] = useState('')
  const [mensal, setMensal] = useState(null)

  useEffect(() => {
    supabase.from('v_dash_status_mensal').select('*').then(({ data }) => setMensal(data || []))
  }, [])

  const validSemRastreio = (mensal || []).reduce((s, m) => s + (m.valid_sem_rastreio || 0), 0)
  const maxMes = Math.max(...(mensal || []).map((m) => m.total_pedidos), 1)

  useEffect(() => {
    let alive = true
    setRows(null)
    async function load() {
      let q = supabase
        .from('v_dash_status_pedidos')
        .select('*', { count: 'exact' })
        .order('data_pedido', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (fConsulta) q = q.eq('tem_consulta', fConsulta === 'sim')
      if (fRastreio) q = q.eq('tem_rastreio', fRastreio === 'sim')
      if (fValidacao) q = q.eq('validacao', fValidacao)
      if (search.trim()) {
        const s = search.trim()
        q = q.or(`cpf.ilike.%${s}%,cliente_nome.ilike.%${s}%,numero_pedido.ilike.%${s}%`)
      }
      const { data, count } = await q
      if (!alive) return
      setRows(data || [])
      setTotal(count || 0)
    }
    load()
    return () => { alive = false }
  }, [page, fConsulta, fRastreio, fValidacao, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Status Pedidos</h1>
        <div className="flex flex-wrap items-center gap-4">
          <TriFilter label="Consulta" value={fConsulta} onChange={(v) => { setFConsulta(v); setPage(0) }} />
          <TriFilter label="Rastreio" value={fRastreio} onChange={(v) => { setFRastreio(v); setPage(0) }} />
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-slate-500">Validação:</span>
            <select value={fValidacao} onChange={(e) => { setFValidacao(e.target.value); setPage(0) }} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">
              <option value="">Todas</option>
              <option value="valid">Válida</option>
              <option value="expired">Expirada</option>
              <option value="no_prescription">Sem prescrição</option>
              <option value="sem_consulta">Sem consulta</option>
            </select>
          </div>
          <input
            placeholder="Buscar CPF, nome ou pedido…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Prescrição válida sem rastreio"
          value={mensal === null ? '…' : validSemRastreio.toLocaleString('pt-BR')}
          sub="pedidos prontos para enviar"
          accent="text-amber-600"
        />
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-slate-500">Total de pedidos por mês</div>
          {mensal === null ? (
            <div className="text-sm text-slate-400">Carregando…</div>
          ) : (
            <div className="flex items-end gap-3" style={{ height: 120 }}>
              {mensal.map((m) => (
                <div key={m.mes} className="flex flex-1 flex-col items-center justify-end">
                  <span className="mb-1 text-xs font-semibold text-ink-900">{m.total_pedidos}</span>
                  <div className="w-full rounded-t bg-brand-500" style={{ height: `${(m.total_pedidos / maxMes) * 90}px` }} />
                  <span className="mt-1 text-xs text-slate-400">{m.mes.slice(5)}/{m.mes.slice(2, 4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Section title={`${total.toLocaleString('pt-BR')} pedidos`}>
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Data</Th><Th>Pedido</Th><Th>Cliente</Th><Th>CPF</Th><Th>Valor</Th><Th>Itens</Th>
                  <Th>Consulta</Th><Th>Válida</Th><Th>Médico</Th><Th>Prescrição</Th><Th>Rastreio</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.numero_pedido}-${i}`} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{fmtDate(r.data_pedido)}</Td>
                    <Td className="font-medium">#{r.numero_pedido}</Td>
                    <Td>{r.cliente_nome || '—'}</Td>
                    <Td className="whitespace-nowrap">{r.cpf || '—'}</Td>
                    <Td className="whitespace-nowrap font-semibold">{r.valor_total != null ? fmtBRL(Number(r.valor_total)) : '—'}</Td>
                    <Td className="max-w-xs truncate" title={r.itens}>{r.itens || '—'}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.tem_consulta ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {r.tem_consulta ? (r.medicacoes || 'Sim') : 'Sem consulta'}
                      </span>
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.consulta_valida ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.consulta_valida ? 'Válida' : (r.status_validacao || 'Inválida')}
                      </span>
                    </Td>
                    <Td>{r.medicos || '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.data_prescricao)}</Td>
                    <Td className="whitespace-nowrap">
                      {r.tem_rastreio
                        ? <span className="font-medium text-brand-600">{r.codigo_rastreio}</span>
                        : <span className="text-slate-400">—</span>}
                    </Td>
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
