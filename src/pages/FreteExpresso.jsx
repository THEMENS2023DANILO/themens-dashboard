import { useEffect, useState } from 'react'
import { supabase, fmtBRL, fmtDateTime } from '../supabase'
import { Section, Spinner, Th, Td, Card } from '../components/ui'

const PAGE = 100

export default function FreteExpresso() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [resumo, setResumo] = useState(null)

  useEffect(() => {
    supabase.from('v_dash_frete_expresso').select('custo_frete, paid_at').limit(50000).then(({ data }) => {
      const d = data || []
      setResumo({
        qtd: d.length,
        receita: d.reduce((s, r) => s + Number(r.custo_frete || 0), 0),
        pagos: d.filter((r) => r.paid_at).length,
      })
    })
  }, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    async function load() {
      let q = supabase
        .from('v_dash_frete_expresso')
        .select('*', { count: 'exact' })
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
        <h1 className="text-2xl font-bold text-ink-900">Frete Expresso</h1>
        <input
          placeholder="Buscar nome, CPF ou nº do pedido…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Pedidos com frete expresso" value={resumo === null ? '…' : resumo.qtd.toLocaleString('pt-BR')} sub="modalidade Super Expresso D+1" />
        <Card title="Pagos" value={resumo === null ? '…' : resumo.pagos.toLocaleString('pt-BR')} accent="text-emerald-600" />
        <Card title="Receita de frete" value={resumo === null ? '…' : fmtBRL(resumo.receita)} accent="text-brand-600" sub="R$ 130,00 por pedido" />
      </div>

      <Section title={`${total.toLocaleString('pt-BR')} pedidos`}>
        {!rows ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Data</Th><Th>Pedido</Th><Th>Cliente</Th><Th>CPF</Th><Th>WhatsApp</Th>
                  <Th>Frete</Th><Th>Total</Th><Th>Itens</Th><Th>Pago</Th><Th>Envio</Th><Th>Rastreio</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</Td>
                    <Td className="font-medium">#{r.numero_pedido}</Td>
                    <Td>{r.cliente_nome || '—'}</Td>
                    <Td className="whitespace-nowrap">{r.cliente_cpf || '—'}</Td>
                    <Td className="whitespace-nowrap">
                      {r.cliente_whatsapp
                        ? <a href={`https://wa.me/${r.cliente_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-brand-600 underline">{r.cliente_whatsapp}</a>
                        : '—'}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold">{fmtBRL(Number(r.custo_frete))}</Td>
                    <Td className="whitespace-nowrap">{fmtBRL(Number(r.valor_total))}</Td>
                    <Td className="max-w-xs truncate" title={r.itens}>{r.itens || '—'}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.pago ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.pago ? 'Pago' : r.payment_status || 'Pendente'}
                      </span>
                    </Td>
                    <Td>{r.status_envio || '—'}</Td>
                    <Td className="whitespace-nowrap">{r.rastreio || '—'}</Td>
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
