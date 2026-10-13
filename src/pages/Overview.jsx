import { useEffect, useState } from 'react'
import { supabase, dayBounds, todaySP, fmtBRL } from '../supabase'
import DateRange from '../components/DateRange'
import { Card, Section, BarList, Spinner } from '../components/ui'

function agrupar(rows, key) {
  const map = {}
  for (const r of rows) {
    const k = r[key] || '—'
    map[k] = (map[k] || 0) + Number(r.total)
  }
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

// Roda a consulta e, se der erro (ex.: banco lento na hora), tenta mais uma vez.
// Nunca devolve "0" no lugar de erro: quem chama recebe { error } e mostra "—".
async function buscar(fazer) {
  let r = await fazer()
  if (r.error) {
    await new Promise((ok) => setTimeout(ok, 1200))
    r = await fazer()
  }
  return r
}

const num = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'))
const brl = (v) => (v == null ? '—' : fmtBRL(v))

function NaoCarregou() {
  return <div className="py-6 text-center text-sm text-red-600">Não carregou. Use “Tentar de novo” acima.</div>
}

export default function Overview() {
  const today = todaySP()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let alive = true
    setData(null)
    async function load() {
      const { start, end } = dayBounds(from, to)

      // Mês corrente (independente do range selecionado) para faturamento e projeção
      const [yy, mm] = today.split('-').map(Number)
      const monthStart = `${yy}-${String(mm).padStart(2, '0')}-01T00:00:00-03:00`
      const monthEnd = new Date(`${monthStart}`)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      const diasNoMes = new Date(yy, mm, 0).getDate()
      const diaAtual = Number(today.split('-')[2])

      const [cadastros, consultas, pendentes, pedidos, spend, lastSpend, mesPagos] = await Promise.all([
        buscar(() => supabase.from('themens_users').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end)),
        buscar(() => supabase.from('v_dash_consultas_agrupadas').select('tipo_consulta, medico_nome, total').gte('attend_date', from).lte('attend_date', to).limit(5000)),
        buscar(() => supabase.from('v_dash_consultas').select('id', { count: 'exact', head: true }).eq('status', 1).gte('request_date', '2026-01-01')),
        buscar(() => supabase.from('v_dash_pedidos').select('valor_total, paid_at').gte('created_at', start).lt('created_at', end).limit(20000)),
        buscar(() => supabase.from('v_dash_fb_spend_filtered').select('business_manager, account_name, spend').gte('date', from).lte('date', to).limit(20000)),
        buscar(() => supabase.from('v_dash_fb_spend_filtered').select('date').order('date', { ascending: false }).limit(1)),
        buscar(() => supabase.from('v_dash_pedidos').select('valor_total').not('paid_at', 'is', null).gte('paid_at', monthStart).lt('paid_at', monthEnd.toISOString()).limit(50000)),
      ])

      if (!alive) return
      const falhas = [
        cadastros.error && 'Cadastros',
        consultas.error && 'Consultas (total, por tipo e por médico)',
        pendentes.error && 'Pendentes de avaliação',
        pedidos.error && 'Pedidos do período',
        spend.error && 'Spend Meta',
        mesPagos.error && 'Faturamento e projeção do mês',
      ].filter(Boolean)
      for (const r of [cadastros, consultas, pendentes, pedidos, spend, lastSpend, mesPagos]) {
        if (r.error) console.error('[Overview]', r.error)
      }

      const fatMes = mesPagos.error ? null : (mesPagos.data || []).reduce((s, p) => s + Number(p.valor_total || 0), 0)
      const projecao = fatMes == null ? null : diaAtual > 0 ? (fatMes / diaAtual) * diasNoMes : 0
      const pagos = (pedidos.data || []).filter((p) => p.paid_at)
      const naoPagos = (pedidos.data || []).filter((p) => !p.paid_at)
      const spendPorBM = {}
      for (const s of spend.data || []) spendPorBM[s.account_name] = (spendPorBM[s.account_name] || 0) + Number(s.spend)

      setData({
        falhas,
        cadastros: cadastros.error ? null : cadastros.count ?? 0,
        consultasErro: !!consultas.error,
        porTipo: agrupar(consultas.data || [], 'tipo_consulta'),
        porMedico: agrupar(consultas.data || [], 'medico_nome'),
        finalizadas: consultas.error ? null : (consultas.data || []).reduce((s, r) => s + Number(r.total), 0),
        pendentes: pendentes.error ? null : pendentes.count ?? 0,
        pedidosPagos: pedidos.error ? null : pagos.length,
        valorPagos: pedidos.error ? null : pagos.reduce((s, p) => s + Number(p.valor_total || 0), 0),
        pedidosNaoPagos: pedidos.error ? null : naoPagos.length,
        valorNaoPagos: pedidos.error ? null : naoPagos.reduce((s, p) => s + Number(p.valor_total || 0), 0),
        spendTotal: spend.error ? null : Object.values(spendPorBM).reduce((a, b) => a + b, 0),
        spendPorBM,
        ultimoSpend: lastSpend.data?.[0]?.date,
        fatMes,
        projecao,
        diaAtual,
        diasNoMes,
      })
    }
    load()
    return () => { alive = false }
  }, [from, to, tentativa])

  const spendDesatualizado = data?.ultimoSpend && data.ultimoSpend < to

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Overview</h1>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {!data ? <Spinner /> : (
        <>
          {data.falhas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>
                <b>Alguns números não carregaram</b> (o banco demorou a responder): {data.falhas.join(', ')}. Eles aparecem como “—”, não como zero.
              </span>
              <button
                onClick={() => setTentativa((n) => n + 1)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Tentar de novo
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Cadastros" value={num(data.cadastros)} sub="novos usuários no período" />
            <Card title="Consultas realizadas" value={num(data.finalizadas)} sub="atendidas no período" />
            <Card title="Pendentes de avaliação" value={num(data.pendentes)} sub="fila atual (desde 2026)" accent="text-amber-600" />
            <Card title="Pedidos pagos" value={num(data.pedidosPagos)} sub={data.pedidosNaoPagos == null ? null : `+ ${data.pedidosNaoPagos} não pagos`} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Valor pedidos pagos" value={brl(data.valorPagos)} accent="text-emerald-600" />
            <Card title="Valor não pagos" value={brl(data.valorNaoPagos)} accent="text-slate-400" />
            <Card title="Spend Meta total" value={brl(data.spendTotal)} accent="text-rose-600" sub={spendDesatualizado ? `⚠️ dados até ${data.ultimoSpend}` : null} />
            {Object.entries(data.spendPorBM).map(([bm, v]) => (
              <Card key={bm} title={`Spend ${bm}`} value={fmtBRL(v)} accent="text-rose-500" />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Faturamento do mês" value={brl(data.fatMes)} accent="text-emerald-600" sub={`pago até hoje (dia ${data.diaAtual}/${data.diasNoMes})`} />
            <Card title="Projeção do mês" value={brl(data.projecao)} accent="text-brand-600" sub="ritmo atual × dias do mês" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Consultas finalizadas por tipo">
              {data.consultasErro ? <NaoCarregou /> : <BarList items={data.porTipo} />}
            </Section>
            <Section title="Consultas por médico">
              {data.consultasErro ? <NaoCarregou /> : <BarList items={data.porMedico} />}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
