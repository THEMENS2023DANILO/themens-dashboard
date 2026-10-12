import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { gerarMinutasPdf } from '../lib/minutaGollog'

// GLP1 - Gollog: cola os pedidos Shopify (S1898…), confere e gera a minuta oficial Gollog de cada um.
// A minuta é preenchida no navegador (formulário oficial em public/minuta-gollog.pdf) e sai num PDF único.
// A numeração/registro fica em glp1_gollog (função glp1_registrar_minutas).

function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || '—'
}

export default function Glp1Gollog() {
  const [rawIds, setRawIds] = useState('')
  const [loading, setLoading] = useState(false)
  const [pedidos, setPedidos] = useState([])
  const [gerando, setGerando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    supabase.rpc('dash_glp1_config').then(({ data }) => setCfg(data || {}))
  }, [])

  async function buscar() {
    const ids = rawIds.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    setLoading(true)
    setErro('')
    setMsg('')
    setPedidos([])
    const { data, error } = await supabase.rpc('dash_glp1_buscar', { p_pedidos: ids })
    if (error) { setErro(`Erro: ${error.message}`); setLoading(false); return }
    setPedidos((data || []).map((p) => {
      const cancelado = !!(p.cancelled_at || p.financial_status === 'refunded')
      const ehGollog = p.rota === 'GOLLOG'
      return { ...p, cancelado, ehGollog, checked: p.encontrado && !cancelado && ehGollog }
    }))
    setLoading(false)
  }

  function toggle(id) { setPedidos((prev) => prev.map((p) => (p.pedido === id ? { ...p, checked: !p.checked } : p))) }
  function toggleAll(val) { setPedidos((prev) => prev.map((p) => ({ ...p, checked: val && p.encontrado && !p.cancelado }))) }

  async function gerar(lista) {
    if (!lista.length) return
    setGerando(true)
    setErro('')
    setMsg('')
    try {
      // numera/registra as minutas
      const { data: nums, error } = await supabase.rpc('glp1_registrar_minutas', { p_pedidos: lista.map((p) => p.pedido) })
      if (error) throw new Error(error.message)
      const mapa = Object.fromEntries((nums || []).map((n) => [n.pedido, n.minuta_num]))
      const comNumero = lista.map((p) => ({ ...p, minuta_num: mapa[p.pedido] ?? p.minuta_num }))
      const valorPadrao = cfg?.notazz?.valor_modo === 'fixo' ? Number(cfg.notazz.valor_fixo) : null
      const nome = lista.length === 1 ? `minuta-gollog-${lista[0].pedido}.pdf` : `minutas-gollog-${new Date().toISOString().slice(0, 10)}-${lista.length}.pdf`
      await gerarMinutasPdf(comNumero, cfg?.gollog, valorPadrao, nome)
      setPedidos((prev) => prev.map((p) => (mapa[p.pedido] ? { ...p, minuta_num: mapa[p.pedido], checked: false } : p)))
      const semNf = lista.filter((p) => !p.nf_numero).length
      setMsg(`✓ ${lista.length} minuta(s) gerada(s) num PDF${semNf ? ` · ${semNf} sem NF ainda (campo Notas Fiscais em branco)` : ''}`)
    } catch (e) {
      setErro(e.message)
    }
    setGerando(false)
  }

  const selecionados = pedidos.filter((p) => p.checked)
  const naoGollog = pedidos.filter((p) => p.encontrado && !p.ehGollog).length
  const allChecked = pedidos.length > 0 && pedidos.filter((p) => p.encontrado && !p.cancelado).every((p) => p.checked)
  const grid = 'grid grid-cols-[2rem_5.5rem_1fr_8.5rem_1fr_9rem_6.5rem_10rem] gap-4'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">GLP1 - Gollog</h1>
        <p className="mt-1 text-sm text-slate-500">Cole os pedidos Shopify (S1898, #1898 ou 1898) e gere a minuta oficial Gollog de cada um, num PDF único.</p>
      </div>

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
          {erro && <p className="text-sm text-red-400">{erro}</p>}
        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} className="h-4 w-4 accent-brand-500" />
              <span className="text-sm text-slate-300">
                {pedidos.length} pedidos — {selecionados.length} selecionados
                {naoGollog > 0 && <span className="ml-2 text-yellow-500">· {naoGollog} fora da rota Gollog</span>}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {msg && <span className="text-sm text-green-400">{msg}</span>}
              <button
                onClick={() => gerar(selecionados)}
                disabled={gerando || selecionados.length === 0 || !cfg}
                className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {gerando ? 'Gerando…' : `Gerar ${selecionados.length} minutas`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-ink-800">
            <div className={`${grid} px-6 py-2 text-xs uppercase tracking-wider text-slate-500`}>
              <div /><div>Pedido</div><div>Nome</div><div>CPF</div><div>Destino</div><div>Aeroporto</div><div>NF</div><div>Minuta</div>
            </div>
            {pedidos.map((p) => (
              <div key={p.pedido} className={`${grid} items-center px-6 py-3 text-sm ${p.checked ? 'bg-ink-800/30' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!p.checked}
                  disabled={!p.encontrado || gerando || p.cancelado}
                  onChange={() => toggle(p.pedido)}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="font-mono text-xs text-slate-400">{p.pedido}</span>
                <span className="truncate text-white">{p.nome || '—'}</span>
                <span className="font-mono text-xs text-slate-300">{p.encontrado ? fmtCpf(p.cpf) : '—'}</span>
                <span className="truncate text-xs text-slate-300" title={p.endereco}>
                  {p.encontrado ? `${p.cidade}/${p.uf}` : '—'}
                  {p.encontrado && !p.ehGollog && <span className="ml-2 text-yellow-500">({p.rota === 'DEDICADO' ? 'Dedicado' : 'Moovway/Verificar'})</span>}
                </span>
                <span className="text-xs text-slate-300">{p.aeroporto_iata ? `${p.aeroporto_iata} · ${p.aeroporto_dist_km} km` : '—'}</span>
                <span className="text-xs">
                  {p.nf_numero ? <span className="text-green-400">{p.nf_numero}</span> : <span className="text-yellow-500">sem NF</span>}
                </span>
                <span className="text-xs">
                  {!p.encontrado ? <span className="text-yellow-500">Não encontrado</span>
                    : p.cancelado ? <span className="text-red-400">Cancelado/reembolsado</span>
                    : p.minuta_num ? (
                      <button onClick={() => gerar([p])} disabled={gerando} className="text-green-400 underline hover:text-green-300">
                        ✓ Minuta {p.minuta_num} — baixar
                      </button>
                    )
                    : <span className="text-slate-400">Pronto para gerar</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
