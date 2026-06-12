import { useEffect, useState } from 'react'
import { supabase, fmtDate } from '../supabase'
import { Section, Spinner, Th, Td } from '../components/ui'

const PAGE = 100

export default function Rastreios() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    setRows(null)
    async function load() {
      let q = supabase
        .from('v_dash_rastreios')
        .select('*', { count: 'exact' })
        .order('data_emissao', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (search.trim()) {
        const s = search.trim()
        q = q.or(`cpf.ilike.%${s}%,codigo_rastreamento.ilike.%${s}%,cliente_nome.ilike.%${s}%`)
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
        <h1 className="text-2xl font-bold text-ink-900">Rastreios Gerados</h1>
        <input
          placeholder="Buscar CPF, rastreio ou nome…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <Section title={`${total.toLocaleString('pt-BR')} rastreios`}>
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>CPF</Th><Th>Rastreio</Th><Th>Cliente</Th><Th>Pedido</Th><Th>Emissão NF</Th><Th>Transportadora</Th><Th>Marca</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.codigo_rastreamento}-${i}`} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{r.cpf || '—'}</Td>
                    <Td className="font-medium">
                      {r.url_rastreamento
                        ? <a href={r.url_rastreamento} target="_blank" rel="noreferrer" className="text-brand-600 underline">{r.codigo_rastreamento}</a>
                        : r.codigo_rastreamento}
                    </Td>
                    <Td>{r.cliente_nome || '—'}</Td>
                    <Td>#{r.numero_pedido || '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.data_emissao)}</Td>
                    <Td>{r.nome_transportador || '—'}</Td>
                    <Td>{r.brand}</Td>
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
