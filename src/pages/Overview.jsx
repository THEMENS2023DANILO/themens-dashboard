import { useEffect, useState } from 'react'
import { supabase, dayBounds, todaySP, fmtBRL } from '../supabase'
import DateRange from '../components/DateRange'
import { Card, Section, BarList, Spinner } from '../components/ui'

function groupCount(rows, key) {
  const map = {}
  for (const r of rows) {
    const k = r[key] || '—'
    map[k] = (map[k] || 0) + 1
  }
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

export default function Overview() {
  const today = todaySP()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    async function load() {
      const { start, end } = dayBounds(from, to)

      const [cadastros, consultas, pendentes, pedidos, spend, lastSpend] = await Promise.all([
        supabase.from('themens_users').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
        supabase.from('v_dash_consultas').select('tipo_consulta, medico_nome').eq('status', 4).gte('attend_date', from).lte('attend_date', to).limit(20000),
        supabase.from('v_dash_consultas').select('id', { count: 'exact', head: true }).eq('status', 1),
        supabase.from('v_dash_pedidos').select('valor_total, paid_at').gte('created_at', start).lt('created_at', end).limit(20000),
        supabase.from('v_dash_fb_spend').select('business_manager, spend').gte('date', from).lte('date', to).limit(20000),
        supabase.from('v_dash_fb_spend').select('date').order('date', { ascending: false }).limit(1),
      ])

      if (!alive) return
      const pagos = (pedidos.data || []).filter((p) => p.paid_at)
      const naoPagos = (pedidos.data || []).filter((p) => !p.paid_at)
      const spendPorBM = {}
      for (const s of spend.data || []) spendPorBM[s.business_manager] = (spendPorBM[s.business_manager] || 0) + Number(s.spend)

      setData({
        cadastros: cadastros.count || 0,
        porTipo: groupCount(consultas.data || [], 'tipo_consulta'),
        porMedico: groupCount(consultas.data || [], 'medico_nome'),
        finalizadas: (consultas.data || []).length,
        pendentes: pendentes.count || 0,
        pedidosPagos: pagos.length,
        valorPagos: pagos.reduce((s, p) => s + Number(p.valor_total || 0), 0),
        pedidosNaoPagos: naoPagos.length,
        valorNaoPagos: naoPagos.reduce((s, p) => s + Number(p.valor_total || 0), 0),
        spendTotal: Object.values(spendPorBM).reduce((a, b) => a + b, 0),
        spendPorBM,
        ultimoSpend: lastSpend.data?.[0]?.date,
      })
    }
    load()
    return () => { alive = false }
  }, [from, to])

  const spendDesatualizado = data?.ultimoSpend && data.ultimoSpend < to

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Overview</h1>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {!data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Cadastros" value={data.cadastros.toLocaleString('pt-BR')} sub="novos usuários no período" />
            <Card title="Consultas finalizadas" value={data.finalizadas.toLocaleString('pt-BR')} sub="no período" />
            <Card title="Pendentes de avaliação" value={data.pendentes.toLocaleString('pt-BR')} sub="fila atual (sem prescrição)" accent="text-amber-600" />
            <Card title="Pedidos pagos" value={data.pedidosPagos.toLocaleString('pt-BR')} sub={`+ ${data.pedidosNaoPagos} não pagos`} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Valor pedidos pagos" value={fmtBRL(data.valorPagos)} accent="text-emerald-600" />
            <Card title="Valor não pagos" value={fmtBRL(data.valorNaoPagos)} accent="text-slate-400" />
            <Card title="Spend Meta total" value={fmtBRL(data.spendTotal)} accent="text-rose-600" sub={spendDesatualizado ? `⚠️ dados até ${data.ultimoSpend}` : null} />
            {Object.entries(data.spendPorBM).map(([bm, v]) => (
              <Card key={bm} title={`Spend ${bm}`} value={fmtBRL(v)} accent="text-rose-500" />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Consultas finalizadas por tipo">
              <BarList items={data.porTipo} />
            </Section>
            <Section title="Consultas por médico">
              <BarList items={data.porMedico} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
