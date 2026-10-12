import { useEffect, useState } from 'react'
import { supabase, fmtBRL, fmtDate } from '../supabase'

// GLP1 - Fiscal: cola os pedidos Shopify (S1898…), confere e envia ao Notazz para emitir NF pela FORYOU.
// Envio: Edge Function glp1-notazz-enviar (um pedido por vez). Retorno da NF: webhook-notaz → notaz_invoices.

const GLP1 = /tirzepatida|semaglutida|mounjaro|ozempic|wegovy|glp/i

function valorNf(p, cfg) {
  if (cfg?.valor_modo === 'fixo') return Number(cfg.valor_fixo || 0)
  const fator = cfg?.valor_modo === 'percentual' ? Number(cfg?.percentual ?? 100) / 100 : 1
  let base = 0
  for (const li of p.line_items || []) {
    if (!GLP1.test(`${li.title || ''} ${li.variant_title || ''} ${li.sku || ''}`)) continue
    const qtd = Number(li.quantity || 1)
    const desc = (li.discount_allocations || []).reduce((a, d) => a + Number(d.amount || 0), 0)
    base += Math.round(((Number(li.price || 0) * qtd - desc) / qtd) * fator * 100) / 100 * qtd
  }
  if (cfg?.incluir_frete) base += Number(p.frete || 0)
  return base
}

function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || '—'
}

function situacaoNf(p) {
  if (p.nf_numero || p.nf_status) {
    const st = p.nf_status || 'Em processamento'
    const ruim = /rejeit|cancel|denegad|erro/i.test(st)
    return { txt: `NF ${p.nf_numero || ''} · ${st}`, cor: ruim ? 'text-red-400' : 'text-green-400', bloqueia: !ruim }
  }
  if (p.fiscal_envio_status === 'enviado') return { txt: 'Enviado, aguardando Notazz', cor: 'text-blue-400', bloqueia: true }
  if (p.fiscal_envio_status === 'erro') return { txt: `Erro anterior: ${p.fiscal_erro || ''}`, cor: 'text-red-400', bloqueia: false }
  return null
}

export default function Glp1Fiscal() {
  const [rawIds, setRawIds] = useState('')
  const [loading, setLoading] = useState(false)
  const [pedidos, setPedidos] = useState([])
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(null)
  const [buscarErro, setBuscarErro] = useState('')
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    supabase.rpc('dash_glp1_config').then(({ data }) => setCfg(data?.notazz || {}))
  }, [])

  async function buscar() {
    const ids = rawIds.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    setLoading(true)
    setBuscarErro('')
    setPedidos([])
    setProgress(null)
    const { data, error } = await supabase.rpc('dash_glp1_buscar', { p_pedidos: ids })
    if (error) { setBuscarErro(`Erro: ${error.message}`); setLoading(false); return }
    setPedidos((data || []).map((p) => {
      const nf = p.encontrado ? situacaoNf(p) : null
      const cancelado = !!(p.cancelled_at || p.financial_status === 'refunded')
      const semCpf = (p.cpf || '').replace(/\D/g, '').length !== 11
      const semCfop = !!cfg && (p.uf || '').toUpperCase() === (cfg.uf_emitente || '').toUpperCase() && !cfg.cfop_interno
      const cidadeSp = (cfg?.pular_cidade_sp ?? true) && (p.uf || '').toUpperCase() === 'SP' &&
        (p.cidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'sao paulo'
      return {
        ...p,
        nf,
        cancelado,
        semCpf,
        semCfop,
        cidadeSp,
        valor: p.encontrado ? valorNf(p, cfg) : 0,
        checked: p.encontrado && !cancelado && !semCpf && !semCfop && !cidadeSp && !nf?.bloqueia && !!p.data_prescricao,
        enviado: false, erro: '', sending: false,
      }
    }))
    setLoading(false)
  }

  function toggle(id) { setPedidos((prev) => prev.map((p) => (p.pedido === id ? { ...p, checked: !p.checked } : p))) }
  function toggleAll(val) { setPedidos((prev) => prev.map((p) => ({ ...p, checked: val && p.encontrado && !p.cancelado && !p.semCpf && !p.cidadeSp && !p.semCfop }))) }

  async function enviarTodos() {
    const sel = pedidos.filter((p) => p.checked && !p.enviado)
    if (sel.length === 0) return
    setSending(true)
    let ok = 0
    for (let i = 0; i < sel.length; i++) {
      const p = sel[i]
      setProgress(`${i + 1}/${sel.length}`)
      setPedidos((prev) => prev.map((x) => (x.pedido === p.pedido ? { ...x, sending: true, erro: '' } : x)))
      try {
        const { data, error } = await supabase.functions.invoke('glp1-notazz-enviar', { body: { pedido: p.pedido } })
        if (error) throw new Error(error.message)
        if (data?.ok) {
          setPedidos((prev) => prev.map((x) => (x.pedido === p.pedido ? { ...x, enviado: true, sending: false, checked: false } : x)))
          ok++
        } else {
          setPedidos((prev) => prev.map((x) => (x.pedido === p.pedido ? { ...x, sending: false, erro: data?.erro || 'Erro Notazz' } : x)))
        }
      } catch (e) {
        setPedidos((prev) => prev.map((x) => (x.pedido === p.pedido ? { ...x, sending: false, erro: e.message } : x)))
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
    setProgress(`Concluído: ${ok}/${sel.length} enviados`)
    setSending(false)
  }

  const selecionados = pedidos.filter((p) => p.checked && !p.enviado).length
  const totalEnviados = pedidos.filter((p) => p.enviado).length
  const totalValor = pedidos.filter((p) => p.checked && !p.enviado).reduce((a, p) => a + p.valor, 0)
  const allChecked = pedidos.length > 0 && pedidos.filter((p) => p.encontrado && !p.cancelado && !p.semCpf && !p.cidadeSp && !p.semCfop).every((p) => p.checked)
  const grid = 'grid grid-cols-[2rem_5.5rem_1fr_8.5rem_1fr_7rem_6.5rem_12rem] gap-4'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">GLP1 - Fiscal</h1>
        <p className="mt-1 text-sm text-slate-500">Cole os pedidos Shopify (S1898, #1898 ou 1898), confira e envie ao Notazz para emitir a NF pela FORYOU (R$ 101,00 · só fora da cidade de SP).</p>
      </div>

      {cfg && !cfg.ativo && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Envio fiscal ainda bloqueado: falta confirmar o valor da NF e os dados do produto (código/NCM/CFOP). Você já pode buscar e conferir os pedidos.
        </div>
      )}

      <div className="space-y-4 rounded-xl bg-ink-900 p-6">
        <label className="block text-sm font-medium text-slate-300">Pedidos (um por linha)</label>
        <textarea
          value={rawIds}
          onChange={(e) => setRawIds(e.target.value)}
          placeholder={'S1898\nS1897\nS1896\n...'}
          rows={6}
          className="w-full rounded-lg bg-ink-800 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 outline-none ring-1 ring-ink-700 focus:ring-brand-500"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={buscar}
            disabled={loading || !rawIds.trim()}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {buscarErro && <p className="text-sm text-red-400">{buscarErro}</p>}
        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} className="h-4 w-4 accent-brand-500" />
              <span className="text-sm text-slate-300">
                {pedidos.length} pedidos — {selecionados} selecionados · {fmtBRL(totalValor)} em NF
              </span>
            </div>
            <div className="flex items-center gap-3">
              {progress && <span className="text-sm text-slate-400">{progress}</span>}
              {totalEnviados > 0 && <span className="text-sm text-green-400">✓ {totalEnviados} enviados</span>}
              <button
                onClick={buscar}
                disabled={sending}
                className="rounded-lg bg-ink-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 disabled:opacity-50"
              >
                Atualizar status
              </button>
              <button
                onClick={enviarTodos}
                disabled={sending || selecionados === 0 || !cfg?.ativo}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
              >
                {sending ? `Enviando ${progress}...` : `Enviar ${selecionados} ao Notazz`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-ink-800">
            <div className={`${grid} px-6 py-2 text-xs uppercase tracking-wider text-slate-500`}>
              <div /><div>Pedido</div><div>Nome</div><div>CPF</div><div>Item</div><div>Valor NF</div><div>Prescrição</div><div>Situação</div>
            </div>
            {pedidos.map((p) => (
              <div
                key={p.pedido}
                className={`${grid} items-center px-6 py-3 text-sm ${p.enviado ? 'opacity-40' : ''} ${p.checked && !p.enviado ? 'bg-ink-800/30' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={p.checked}
                  disabled={!p.encontrado || p.enviado || p.sending || p.cancelado || p.semCpf || p.cidadeSp}
                  onChange={() => toggle(p.pedido)}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="font-mono text-xs text-slate-400">{p.pedido}</span>
                <span className="truncate text-white">{p.nome || '—'}</span>
                <span className="font-mono text-xs text-slate-300">{p.encontrado ? fmtCpf(p.cpf) : '—'}</span>
                <span className="truncate text-slate-300" title={p.item}>
                  {p.encontrado ? `${p.produto || ''} ${p.dosagem || ''}${p.quantidade > 1 ? ` · ${p.quantidade} un.` : ''}` : '—'}
                </span>
                <span className="font-mono text-xs text-slate-300">{p.encontrado ? fmtBRL(p.valor) : '—'}</span>
                <span className="text-xs">
                  {!p.encontrado ? '—' : p.data_prescricao
                    ? <span className="text-green-400">{fmtDate(`${p.data_prescricao}T12:00:00`)}</span>
                    : <span className="text-yellow-500">Sem prescrição</span>}
                </span>
                <span className="text-xs">
                  {p.sending && <span className="text-blue-400">Enviando…</span>}
                  {p.enviado && <span className="text-green-400">✓ Enviado ao Notazz</span>}
                  {p.erro && <span className="text-red-400" title={p.erro}>❌ {p.erro}</span>}
                  {!p.enviado && !p.sending && !p.erro && (
                    !p.encontrado ? <span className="text-yellow-500">Não encontrado</span>
                      : p.cancelado ? <span className="text-red-400">Cancelado/reembolsado</span>
                      : p.semCpf ? <span className="text-yellow-500">Sem CPF</span>
                      : p.cidadeSp ? <span className="text-slate-500">Cidade de SP — não emite NF</span>
                      : p.semCfop ? <span className="text-yellow-500" title="Entrega dentro do estado do emitente: falta definir o CFOP interno">Falta CFOP ({p.uf})</span>
                      : p.nf ? <span className={p.nf.cor} title={p.nf.txt}>{p.nf.txt}</span>
                      : <span className="text-slate-400">Pronto para enviar</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
