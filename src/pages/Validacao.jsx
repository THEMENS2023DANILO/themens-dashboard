import { useState } from 'react'
import { supabase } from '../supabase'

const TINY_PROXY = 'http://54.152.128.19:5001'
const EXCECAO_50 = '2x chocosono - durma melhor (2)'

function calcValorTiny(products) {
  return products.reduce((total, item) => {
    const nome  = (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const price = parseFloat(item.price)
    const qty   = parseInt(item.quantity)
    const fator = nome === EXCECAO_50 ? 0.5 : 0.1
    return total + Math.round(price * fator * 100) / 100 * qty
  }, 0)
}

const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Validacao() {
  const [rawIds, setRawIds]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [pedidos, setPedidos]       = useState([])
  const [sending, setSending]       = useState(false)
  const [progress, setProgress]     = useState(null)
  const [buscarErro, setBuscarErro] = useState('')

  async function buscar() {
    const ids = rawIds.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    setLoading(true)
    setBuscarErro('')
    setPedidos([])

    const { data, error } = await supabase
      .from('nuvemshop_orders')
      .select('external_id, raw_data')
      .in('external_id', ids)

    if (error) { setBuscarErro(`Erro: ${error.message}`); setLoading(false); return }

    const map = {}
    for (const row of (data || [])) map[row.external_id] = row.raw_data

    setPedidos(ids.map(id => {
      const r = map[id]
      const produtos   = r?.products?.map(p => p.name).join(', ') || '—'
      const valorTiny  = r?.products ? calcValorTiny(r.products) : 0
      return {
        id, found: !!r, checked: true, enviado: false, erro: '', sending: false,
        nome:      r?.contact_name           || '—',
        cpf:       r?.contact_identification || '—',
        produto:   produtos,
        valorTiny,
      }
    }))
    setLoading(false)
  }

  function toggle(id) { setPedidos(prev => prev.map(p => p.id === id ? { ...p, checked: !p.checked } : p)) }
  function toggleAll(val) { setPedidos(prev => prev.map(p => ({ ...p, checked: val }))) }

  async function enviarTodos() {
    const sel = pedidos.filter(p => p.checked && !p.enviado)
    if (sel.length === 0) return
    setSending(true)
    let ok = 0
    for (let i = 0; i < sel.length; i++) {
      const p = sel[i]
      setProgress(`${i + 1}/${sel.length}`)
      setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, sending: true } : x))
      try {
        const res  = await fetch(`${TINY_PROXY}/api/enviar/${p.id}`, { method: 'POST' })
        const data = await res.json()
        if (data.ok) {
          setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, enviado: true, sending: false } : x))
          ok++
        } else {
          setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, sending: false, erro: data.erro || 'Erro Tiny' } : x))
        }
      } catch (e) {
        setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, sending: false, erro: e.message } : x))
      }
      await new Promise(r => setTimeout(r, 1200))
    }
    setProgress(`Concluído: ${ok}/${sel.length} enviados`)
    setSending(false)
  }

  const selecionados  = pedidos.filter(p => p.checked && !p.enviado).length
  const totalEnviados = pedidos.filter(p => p.enviado).length
  const allChecked    = pedidos.length > 0 && pedidos.every(p => p.checked)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Validação de Pedidos</h1>
        <p className="mt-1 text-sm text-slate-400">Cole os IDs, confira os dados e envie ao Tiny.</p>
      </div>

      <div className="rounded-xl bg-ink-900 p-6 space-y-4">
        <label className="block text-sm font-medium text-slate-300">IDs dos Pedidos (um por linha)</label>
        <textarea value={rawIds} onChange={e => setRawIds(e.target.value)}
          placeholder={'2064405381\n2064388542\n2064364438\n...'}
          rows={6} className="w-full rounded-lg bg-ink-800 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-ink-700 focus:ring-brand-500 font-mono" />
        <div className="flex items-center gap-3">
          <button onClick={buscar} disabled={loading || !rawIds.trim()}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {buscarErro && <p className="text-sm text-red-400">{buscarErro}</p>}
        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="rounded-xl bg-ink-900 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} className="w-4 h-4 accent-brand-500" />
              <span className="text-sm text-slate-300">{pedidos.length} pedidos — {selecionados} selecionados</span>
            </div>
            <div className="flex items-center gap-3">
              {progress && <span className="text-sm text-slate-400">{progress}</span>}
              {totalEnviados > 0 && <span className="text-sm text-green-400">✓ {totalEnviados} enviados</span>}
              <button onClick={enviarTodos} disabled={sending || selecionados === 0}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                {sending ? `Enviando ${progress}...` : `Enviar ${selecionados} ao Tiny`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-ink-800">
            <div className="grid grid-cols-[2rem_7rem_1fr_8rem_1fr_7rem] gap-4 px-6 py-2 text-xs uppercase tracking-wider text-slate-500">
              <div/><div>ID</div><div>Nome</div><div>CPF</div><div>Produto</div><div>Valor Tiny</div>
            </div>
            {pedidos.map(p => (
              <div key={p.id} className={`grid grid-cols-[2rem_7rem_1fr_8rem_1fr_7rem] gap-4 px-6 py-3 items-center text-sm ${p.enviado ? 'opacity-40' : ''} ${p.checked && !p.enviado ? 'bg-ink-800/30' : ''}`}>
                <input type="checkbox" checked={p.checked} disabled={p.enviado || p.sending} onChange={() => toggle(p.id)} className="w-4 h-4 accent-brand-500" />
                <span className="text-slate-400 font-mono text-xs">{p.id}</span>
                <span className="text-white truncate">{p.nome}</span>
                <span className="text-slate-300 font-mono text-xs">{p.cpf}</span>
                <span className="text-slate-300 truncate">{p.produto}</span>
                <span className="text-xs font-mono">
                  {p.sending && <span className="text-blue-400">Enviando…</span>}
                  {p.enviado && <span className="text-green-400">✓ Enviado</span>}
                  {p.erro    && <span className="text-red-400" title={p.erro}>❌ Erro</span>}
                  {!p.enviado && !p.sending && !p.erro && (
                    <span className={p.found ? 'text-slate-300' : 'text-yellow-500'}>
                      {p.found ? fmtBRL(p.valorTiny) : 'Não encontrado'}
                    </span>
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
