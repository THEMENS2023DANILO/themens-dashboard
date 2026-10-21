import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtBRL, todaySP } from '../supabase'
import { Spinner } from '../components/ui'

// DRE gerencial por mês (RPC dash_dre). Receita = pedidos pagos (Nuvemshop + Shopify) pela data do pedido (SP).
// Custos de produto: tabela dre_custos (custo × itens vendidos). Frete: valor médio × pedidos.
// Marketing: gasto Meta das contas Hims e Health (+ BM Lyfee: automático se houver, senão lançamento manual).
// Despesas fixas e parâmetros: tabela dre_parametros (editáveis aqui).

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES[Number(m) - 1]}/${a}` }
const mesAnterior = (ym, n) => {
  const [a, m] = ym.split('-').map(Number)
  const d = new Date(a, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const num = (v) => Number(v || 0)
const brl = (v) => fmtBRL(v)
const pct = (v, base) => (base ? `${((100 * v) / base).toFixed(1).replace('.', ',')}%` : '—')

function calcula(d) {
  const rn = num(d.receita_nuvemshop), rs = num(d.receita_shopify)
  const rb = rn + rs
  const imposto = rb * num(d.aliquota) / 100
  const rl = rb - imposto
  const cn = num(d.custo_nuvemshop), cs = num(d.custo_shopify)
  const ln = num(d.pedidos_nuvemshop) * num(d.frete_unit_nuvemshop)
  const ls = num(d.pedidos_shopify) * num(d.frete_unit_shopify)
  const mkt = Object.fromEntries((d.marketing || []).map((m) => [m.conta, num(m.valor)]))
  // BM Lyfee: usa o gasto automático quando a conta estiver integrada; senão, o valor digitado no mês
  const lyfee = num(mkt['BM Lyfee']) > 0 ? num(mkt['BM Lyfee']) : num(d.marketing_lyfee_manual)
  const midia = num(mkt.Hims) + num(mkt.Health) + lyfee
  // impostos cobrados pelo Meta sobre a mídia (não aparecem no gasto da API)
  const impostoMidia = midia * num(d.imposto_midia) / 100
  const whatsapp = d.whatsapp_manual != null ? num(d.whatsapp_manual) : num(d.whatsapp_padrao)
  const influencer = num(d.influencer_manual)
  const mktTotal = midia + impostoMidia + whatsapp + influencer
  const mc = rl - cn - cs - ln - ls
  const fixas = (d.fixas || []).map((f) => ({ ...f, valor: num(f.valor) }))
  // total de despesas fixas informado para o mês (sem abertura por área) substitui a soma das categorias
  const fixasManual = d.fixas_total_manual != null ? num(d.fixas_total_manual) : null
  const fixasTotal = fixasManual ?? fixas.reduce((a, f) => a + f.valor, 0)
  const aposMkt = mc - mktTotal
  return {
    rn, rs, rb, imposto, rl, cn, cs, cmv: cn + cs, ln, ls, log: ln + ls, mc,
    hims: num(mkt.Hims), health: num(mkt.Health), lyfeeAuto: num(mkt['BM Lyfee']), lyfeeManual: d.marketing_lyfee_manual,
    lyfee, whatsapp, whatsappManual: d.whatsapp_manual, influencer, influencerManual: d.influencer_manual, impostoMidia, aliqMidia: num(d.imposto_midia), mktTotal, aposMkt, fixas, fixasManual, fixasTotal, resultado: aposMkt - fixasTotal,
    pn: num(d.pedidos_nuvemshop), ps: num(d.pedidos_shopify),
  }
}

function CampoLancamento({ mes, chave, valor, onSalvo, titulo }) {
  const [v, setV] = useState(valor ?? '')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setV(valor ?? '') }, [valor])
  async function salvar() {
    const n = v === '' ? null : Number(String(v).replace(/\./g, '').replace(',', '.'))
    if (n != null && Number.isNaN(n)) return
    setSalvando(true)
    const { error } = await supabase.rpc('dre_salvar_lancamento', { p_mes: `${mes}-01`, p_chave: chave, p_valor: n })
    setSalvando(false)
    if (error) alert(`Não salvou: ${error.message}`)
    else onSalvo()
  }
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      disabled={salvando}
      placeholder="digitar"
      title={titulo}
      className="w-28 rounded border border-dashed border-slate-300 px-2 py-0.5 text-right text-sm"
    />
  )
}

export default function Dre() {
  const hoje = todaySP().slice(0, 7)
  const [mes, setMes] = useState(hoje)
  const [dados, setDados] = useState({})
  const [erro, setErro] = useState('')
  const [tick, setTick] = useState(0)
  const meses = useMemo(() => [mesAnterior(mes, 2), mesAnterior(mes, 1), mes], [mes])

  useEffect(() => {
    let vivo = true
    setErro('')
    Promise.all(meses.map((m) => supabase.rpc('dash_dre', { p_mes: `${m}-01` }))).then((rs) => {
      if (!vivo) return
      const e = rs.find((r) => r.error)
      if (e) { setErro(e.error.message); return }
      setDados(Object.fromEntries(rs.map((r, i) => [meses[i], r.data])))
    })
    return () => { vivo = false }
  }, [meses, tick])

  const calc = useMemo(() => meses.map((m) => (dados[m] ? calcula(dados[m]) : null)), [meses, dados])
  const pronto = calc.every(Boolean)
  const atual = dados[mes]

  const linha = (rotulo, f, opts = {}) => (
    <tr key={rotulo} className={opts.total ? 'bg-slate-50 font-semibold text-ink-900' : opts.sub ? 'text-slate-500' : ''}>
      <td className={`border-b border-slate-100 py-2 pr-4 text-sm ${opts.sub ? 'pl-8' : 'pl-3'} ${opts.total ? 'font-semibold' : ''}`}>{rotulo}</td>
      {calc.map((c, i) => {
        const v = c ? f(c, i) : 0
        const neg = opts.despesa
        return (
          <td key={meses[i]} className="border-b border-slate-100 px-3 py-2 text-right text-sm tabular-nums">
            {opts.render ? opts.render(c, i) : (
              <>
                <div className={opts.total && v < 0 ? 'text-red-600' : ''}>{neg && v ? `(${brl(v)})` : brl(v)}</div>
                {!opts.semPct && <div className="text-[11px] text-slate-400">{pct(v, c?.rb)}</div>}
              </>
            )}
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">DRE</h1>
          <div className="text-xs text-slate-400">Gerencial · pedidos pagos pela data do pedido · % sobre a receita bruta</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mês
          <input type="month" value={mes} max={hoje} onChange={(e) => e.target.value && setMes(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
        </label>
      </div>

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro ao carregar: {erro}</div>}

      {!pronto ? <Spinner /> : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500" />
                  {meses.map((m) => (
                    <th key={m} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {rotuloMes(m)}{m === hoje && <span className="ml-1 font-normal normal-case text-slate-400">(parcial)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linha('Receita bruta (vendas do mês)', (c) => c.rb, { total: true })}
                {linha('Nuvemshop', (c) => c.rn, { sub: true })}
                {linha('Shopify', (c) => c.rs, { sub: true })}
                {linha(`(−) Impostos (${String(atual?.aliquota ?? 2.3).replace('.', ',')}%)`, (c) => c.imposto, { despesa: true })}
                {linha('Receita líquida', (c) => c.rl, { total: true })}
                {linha('(−) Custo dos produtos', (c) => c.cmv, { despesa: true })}
                {linha('Nuvemshop', (c) => c.cn, { sub: true, despesa: true })}
                {linha('Shopify', (c) => c.cs, { sub: true, despesa: true })}
                {linha('(−) Logística (frete médio)', (c) => c.log, { despesa: true })}
                {linha('Nuvemshop', (c) => c.ln, {
                  sub: true, despesa: true,
                  render: (c) => <><div>({brl(c.ln)})</div><div className="text-[11px] text-slate-400">{c.pn} pedidos × {brl(atual?.frete_unit_nuvemshop)}</div></>,
                })}
                {linha('Shopify', (c) => c.ls, {
                  sub: true, despesa: true,
                  render: (c) => <><div>({brl(c.ls)})</div><div className="text-[11px] text-slate-400">{c.ps} pedidos × {brl(atual?.frete_unit_shopify)}</div></>,
                })}
                {linha('Margem de contribuição', (c) => c.mc, { total: true })}
                {linha('(−) Marketing', (c) => c.mktTotal, { despesa: true })}
                {linha('Hims', (c) => c.hims, { sub: true, despesa: true })}
                {linha('Health', (c) => c.health, { sub: true, despesa: true })}
                {linha('BM Lyfee', (c) => c.lyfee, {
                  sub: true, despesa: true,
                  render: (c, i) => (
                    <div className="flex flex-col items-end gap-0.5">
                      {c.lyfeeAuto > 0
                        ? <div>({brl(c.lyfeeAuto)}) <span className="text-[11px] text-slate-400">automático</span></div>
                        : <CampoLancamento mes={meses[i]} chave="mkt_lyfee" valor={c.lyfeeManual} titulo="Gasto da BM Lyfee no mês (a conta ainda não está integrada)" onSalvo={() => setTick((n) => n + 1)} />}
                    </div>
                  ),
                })}
                {linha(`Impostos sobre mídia (${String(calc[2]?.aliqMidia ?? 12.5).replace('.', ',')}%)`, (c) => c.impostoMidia, { sub: true, despesa: true })}
                {linha('WhatsApp', (c) => c.whatsapp, {
                  sub: true, despesa: true,
                  render: (c, i) => (
                    <div className="flex justify-end">
                      <CampoLancamento mes={meses[i]} chave="mkt_whatsapp" valor={c.whatsappManual ?? c.whatsapp} titulo="Custo de WhatsApp no mês (padrão nos parâmetros)" onSalvo={() => setTick((n) => n + 1)} />
                    </div>
                  ),
                })}
                {linha('Influenciadores', (c) => c.influencer, {
                  sub: true, despesa: true,
                  render: (c, i) => (
                    <div className="flex justify-end">
                      <CampoLancamento mes={meses[i]} chave="mkt_influencer" valor={c.influencerManual} titulo="Gasto com influenciadores no mês" onSalvo={() => setTick((n) => n + 1)} />
                    </div>
                  ),
                })}
                {linha('Resultado após marketing', (c) => c.aposMkt, { total: true })}
                {linha('(−) Despesas fixas', (c) => c.fixasTotal, { despesa: true })}
                {(calc[2].fixas || []).map((f, idx) => linha(f.descricao, (c) => (c.fixasManual != null ? 0 : c.fixas[idx]?.valor || 0), {
                  sub: true, despesa: true,
                  render: (c) => (c.fixasManual != null
                    ? <span className="text-xs text-slate-300">—</span>
                    : <><div>({brl(c.fixas[idx]?.valor || 0)})</div><div className="text-[11px] text-slate-400">{pct(c.fixas[idx]?.valor || 0, c.rb)}</div></>),
                }))}
                {linha('Total do mês informado (substitui as áreas)', (c) => c.fixasManual || 0, {
                  sub: true,
                  render: (c, i) => (
                    <div className="flex justify-end">
                      <CampoLancamento mes={meses[i]} chave="fixas_total" valor={c.fixasManual} titulo="Total de despesas fixas do mês. Deixe vazio para usar a soma das áreas." onSalvo={() => setTick((n) => n + 1)} />
                    </div>
                  ),
                })}
                {linha('Resultado (EBITDA)', (c) => c.resultado, { total: true })}
              </tbody>
            </table>
          </div>

          {atual?.sem_custo?.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Itens vendidos em {rotuloMes(mes)} sem custo cadastrado (entram com custo zero)
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
                {atual.sem_custo.map((s) => (
                  <li key={`${s.origem}${s.nome}`}>{s.qtd}× {s.nome} <span className="text-amber-700">({s.origem})</span></li>
                ))}
              </ul>
            </div>
          )}

          <Parametros onSalvo={() => setTick((n) => n + 1)} />
        </>
      )}
    </div>
  )
}

// Parâmetros e despesas fixas (valem para todos os meses)
function Parametros({ onSalvo }) {
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState(null)
  const [edit, setEdit] = useState({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!aberto || lista) return
    supabase.rpc('dash_dre', { p_mes: `${todaySP().slice(0, 7)}-01` }).then(({ data }) => {
      if (!data) return
      setLista([
        { chave: 'aliquota_imposto', descricao: 'Alíquota de imposto (%)', valor: data.aliquota },
        { chave: 'frete_nuvemshop', descricao: 'Frete médio por pedido Nuvemshop (R$)', valor: data.frete_unit_nuvemshop },
        { chave: 'frete_shopify', descricao: 'Frete médio por pedido Shopify (R$)', valor: data.frete_unit_shopify },
        { chave: 'imposto_midia', descricao: 'Imposto sobre mídia Meta (%)', valor: data.imposto_midia },
        { chave: 'mkt_whatsapp', descricao: 'WhatsApp padrão (R$/mês)', valor: data.whatsapp_padrao },
        ...(data.fixas || []).map((f) => ({ ...f, descricao: `Despesa ${f.descricao} (R$/mês)` })),
      ])
    })
  }, [aberto, lista])

  async function salvar() {
    setMsg('')
    for (const [chave, txt] of Object.entries(edit)) {
      const n = Number(String(txt).replace(/\./g, '').replace(',', '.'))
      if (Number.isNaN(n)) { setMsg(`Valor inválido em ${chave}`); return }
      const { error } = await supabase.rpc('dre_salvar_parametro', { p_chave: chave, p_valor: n })
      if (error) { setMsg(`Erro: ${error.message}`); return }
    }
    setEdit({})
    setLista(null)
    setMsg('Salvo.')
    onSalvo()
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <button onClick={() => setAberto((a) => !a)} className="text-sm font-semibold text-ink-900">
        {aberto ? '▾' : '▸'} Parâmetros e despesas fixas
      </button>
      {aberto && (
        <div className="mt-3 space-y-2">
          {!lista ? <div className="text-sm text-slate-400">Carregando…</div> : lista.map((p) => (
            <div key={p.chave} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-600">{p.descricao}</span>
              <input
                value={edit[p.chave] ?? String(p.valor).replace('.', ',')}
                onChange={(e) => setEdit((x) => ({ ...x, [p.chave]: e.target.value }))}
                className="w-32 rounded border border-slate-300 px-2 py-1 text-right"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={salvar} disabled={!Object.keys(edit).length} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              Salvar
            </button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
            <span className="text-xs text-slate-400">Os custos de cada produto ficam numa tabela no banco; me peça para alterar.</span>
          </div>
        </div>
      )}
    </div>
  )
}
