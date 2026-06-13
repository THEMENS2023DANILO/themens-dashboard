import { useEffect, useState } from 'react'
import { supabase, fmtBRL, fmtDateTime } from '../supabase'
import { Section, Spinner, Th, Td } from '../components/ui'

const PAGE = 100

export default function Pedidos() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    setRows(null)
    async function load() {
      let q = supabase
        .from('v_dash_pedidos')
        .select('*', { count: 'exact' })
        .gte('created_at', '2026-01-01T00:00:00-03:00')
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (search.trim()) {
        const s = search.trim()
        q = q.or(`cliente_nome.ilike.%${s}%,cliente_cpf.ilike.%${s}%,numero_pedido.ilike.%${s}%`)
      }
      const { data, count } = await q
      if (!alive) return
      setRows(data || [])
      setTotal(count || 0)
    }
    load()
    return () => { alive = false }
  }, [page, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Breakdown Pedidos 2026</h1>
        <input
          placeholder="Buscar nome, CPF ou nº do pedido…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <Section title={`${total.toLocaleString('pt-BR')} pedidos desde 01/01/2026`}>
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Data</Th><Th>Pedido</Th><Th>Cliente</Th><Th>CPF</Th><Th>Valor</Th>
                  <Th>Itens</Th><Th>Qtd</Th>
                  <Th>Chocosono</Th><Th>Tadalaspray</Th><Th>Prolongue 20</Th><Th>Prolongue 30</Th><Th>Creatina</Th>
                  <Th>Pagamento</Th><Th>Status pgto</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</Td>
                    <Td className="font-medium">#{r.numero_pedido}</Td>
                    <Td>{r.cliente_nome || '—'}</Td>
                    <Td className="whitespace-nowrap">{r.cliente_cpf || '—'}</Td>
                    <Td className="whitespace-nowrap font-semibold">{fmtBRL(Number(r.valor_total))}</Td>
                    <Td className="max-w-xs truncate" title={r.itens}>{r.itens || '—'}</Td>
                    <Td>{r.qtd_itens}</Td>
                    <Td className="text-center">{r.qtd_chocosono || ''}</Td>
                    <Td className="text-center">{r.qtd_tadalaspray || ''}</Td>
                    <Td className="text-center">{r.qtd_prolongue20 || ''}</Td>
                    <Td className="text-center">{r.qtd_prolongue30 || ''}</Td>
                    <Td className="text-center">{r.qtd_creatina || ''}</Td>
                    <Td>{r.tipo_pagamento}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.paid_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.paid_at ? 'Pago' : r.payment_status || 'Pendente'}
                      </span>
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
