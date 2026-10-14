import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtDate } from '../supabase'
import { Section, Spinner, Th, Td } from '../components/ui'
import { STATUS, COR_STATUS, PRODUTOS, ROTAS, ehPago, bateBusca } from '../lib/glp1'
import {
  MODELOS_VIAL, CAMPOS_AUTO, ROTULO_CAMPO, camposDoTexto, linhasVial,
  gerarEtiquetasRastreio, gerarEtiquetasVial, gerarEtiquetasVialZpl,
} from '../lib/etiquetas'

// GLP1 - Etiquetas: rastreio (Zebra 100x70) e vial (COSMO / VERBENNA).
// Lista = pedidos pagos no Shopify; por padrão só os não concluídos.

const LS = 'glp1-etiquetas-vial'
const ler = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
const gravar = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)) } catch { /* sem storage */ } }
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default function Glp1Etiquetas() {
  const [aba, setAba] = useState('rastreio')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [produto, setProduto] = useState('')
  const [rota, setRota] = useState('')
  const [status, setStatus] = useState('')
  const [soAbertos, setSoAbertos] = useState(true)
  const [busca, setBusca] = useState('')
  const [colar, setColar] = useState('')
  const [aviso, setAviso] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [gerando, setGerando] = useState(false)

  // configuração do vial (lembrada neste navegador)
  const salvo = useMemo(ler, [])
  const [modeloId, setModeloId] = useState(salvo.modeloId || 'COSMO')
  const [cfg, setCfg] = useState(() => {
    const base = {}
    for (const [id, m] of Object.entries(MODELOS_VIAL)) {
      base[id] = { largura: m.largura, altura: m.altura, texto: m.texto, valores: { ...m.padrao }, ...(salvo.cfg?.[id] || {}) }
    }
    return base
  })
  const [porUnidade, setPorUnidade] = useState(salvo.porUnidade ?? true)
  const [dpi, setDpi] = useState(salvo.dpi || 203)
  const [editarModelo, setEditarModelo] = useState(false)
  useEffect(() => { gravar({ modeloId, cfg, porUnidade, dpi }) }, [modeloId, cfg, porUnidade, dpi])

  const atual = cfg[modeloId]
  const setAtual = (patch) => setCfg((c) => ({ ...c, [modeloId]: { ...c[modeloId], ...patch } }))
  const campos = camposDoTexto(atual.texto).filter((k) => !CAMPOS_AUTO.includes(k))

  useEffect(() => {
    supabase.rpc('dash_glp1_pedidos', { p_busca: null, p_rota: null, p_limit: 5000 }).then(({ data, error }) => {
      if (error) { setErro(error.message); return }
      setDados(data.lista.filter(ehPago))
    })
  }, [])

  const lista = useMemo(() => (dados || []).filter((p) => {
    if (produto && p.produto !== produto) return false
    if (rota && p.rota !== rota) return false
    if (soAbertos && !p.status_aberto) return false
    if (status && p.status_pedido !== status) return false
    return bateBusca(p, busca)
  }), [dados, produto, rota, soAbertos, status, busca])

  const selecionados = (dados || []).filter((p) => sel.has(p.shopify_order_id))
  const todosVisiveis = lista.length > 0 && lista.every((p) => sel.has(p.shopify_order_id))

  function alternar(id) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function alternarTodos() {
    setSel((s) => {
      const n = new Set(s)
      if (todosVisiveis) lista.forEach((p) => n.delete(p.shopify_order_id))
      else lista.forEach((p) => n.add(p.shopify_order_id))
      return n
    })
  }
  function selecionarColados() {
    const nums = [...new Set(colar.split(/[\s,;]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean))]
    const porNum = new Map((dados || []).map((p) => [p.pedido.replace(/\D/g, ''), p]))
    const achados = nums.filter((n) => porNum.has(n))
    const faltam = nums.filter((n) => !porNum.has(n))
    setSel(new Set(achados.map((n) => porNum.get(n).shopify_order_id)))
    setAviso(`${achados.length} pedido(s) selecionado(s)${faltam.length ? ` · não encontrados (ou não pagos): ${faltam.map((n) => 'S' + n).join(', ')}` : ''}`)
  }

  const ordenados = () => [...selecionados].sort((a, b) => Number(a.pedido.replace(/\D/g, '')) - Number(b.pedido.replace(/\D/g, '')))

  async function gerarRastreio() {
    setGerando(true)
    try { await gerarEtiquetasRastreio(ordenados(), `etiquetas-rastreio-${hoje()}.pdf`) } catch (e) { setErro(String(e.message || e)) }
    setGerando(false)
  }

  async function gerarVial(formato) {
    setGerando(true)
    setErro('')
    try {
      let peds = ordenados()
      if (/\{MEDICO\}/.test(atual.texto)) {
        const { data, error } = await supabase.rpc('glp1_medico_pedidos', { p_ids: peds.map((p) => p.shopify_order_id) })
        if (error) throw error
        const med = new Map((data || []).map((r) => [r.shopify_order_id, r]))
        peds = peds.map((p) => ({ ...p, ...(med.get(p.shopify_order_id) || {}) }))
      }
      const itens = peds.flatMap((p) => {
        const linhas = linhasVial(atual.texto, p, atual.valores)
        const n = porUnidade ? Math.max(1, Number(p.quantidade) || 1) : 1
        return Array.from({ length: n }, () => ({ pedido: p, linhas }))
      })
      const tam = { largura: Number(atual.largura), altura: Number(atual.altura) }
      const base = `etiquetas-vial-${modeloId.toLowerCase()}-${hoje()}`
      if (formato === 'zpl') gerarEtiquetasVialZpl(itens, tam, Number(dpi), `${base}.zpl`)
      else await gerarEtiquetasVial(itens, tam, `${base}.pdf`)
    } catch (e) { setErro(String(e.message || e)) }
    setGerando(false)
  }

  const faltaCampo = aba === 'vial' && campos.some((k) => !String(atual.valores[k] ?? '').trim())
  const qtdEtiquetas = aba === 'vial' && porUnidade
    ? selecionados.reduce((s, p) => s + Math.max(1, Number(p.quantidade) || 1), 0)
    : selecionados.length
  const exemplo = selecionados[0] || lista[0]
  const previa = exemplo ? linhasVial(atual.texto, { ...exemplo, medico_nome: exemplo.medico_nome || 'Nome do Médico', medico_crm: exemplo.medico_crm || 'CRM 000000/SP' }, atual.valores) : []

  const pill = (ativo) => `rounded-full px-3 py-1 text-xs font-medium ${ativo ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
  const inp = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">GLP1 — Etiquetas</h1>
        <div className="text-xs text-slate-400">Selecione os pedidos e gere o PDF. Na impressão escolha tamanho real (100%), sem ajustar à página.</div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setAba('rastreio')} className={`${pill(aba === 'rastreio')} !px-4 !py-2 !text-sm`}>📦 Rastreio (Zebra 100×70)</button>
        <button onClick={() => setAba('vial')} className={`${pill(aba === 'vial')} !px-4 !py-2 !text-sm`}>🧪 Vial (COSMO / VERBENNA)</button>
      </div>

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro: {erro}</div>}

      {aba === 'rastreio' ? (
        <Section title="Etiqueta de rastreio · 100 × 70 mm">
          <div className="flex flex-wrap items-start gap-6">
            <div className="w-[300px] shrink-0 rounded-lg border-2 border-slate-800 bg-white p-2 font-sans text-[10px] leading-tight text-black" style={{ aspectRatio: '100 / 70' }}>
              <div className="flex justify-between"><b className="text-[12px] uppercase">{exemplo?.nome || 'NOME COMPLETO'}</b><span className="text-[8px] text-slate-500">{exemplo?.pedido}</span></div>
              <div className="mt-1">{exemplo ? `${exemplo.end_rua}, ${exemplo.end_numero}${exemplo.end_complemento ? ` - ${exemplo.end_complemento}` : ''}` : 'Endereço completo'}</div>
              <div>{exemplo?.end_bairro}</div>
              <div>{exemplo ? `${exemplo.cidade}/${exemplo.uf} - CEP ${exemplo.cep}` : ''}</div>
              <div className="mt-3 space-y-2.5">
                <div><b>CPF:</b> ______________________________</div>
                <div><b>Data de recebimento:</b> ____ / ____ / ________</div>
                <div><b>Nome legível:</b> _________________________</div>
                <div><b>Assinatura:</b> ___________________________</div>
              </div>
            </div>
            <div className="text-sm text-slate-600">
              <p>Duas etiquetas por pedido: 1) nome completo, endereço completo e os campos para o cliente preencher na entrega; 2) só o nome do paciente, o produto e a quantidade.</p>
              <button
                onClick={gerarRastreio}
                disabled={!selecionados.length || gerando}
                className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {gerando ? 'Gerando…' : `Gerar PDF · ${selecionados.length * 2} etiqueta(s) (${selecionados.length} pedidos)`}
              </button>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Etiqueta de vial">
          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-3">
              <div className="flex gap-2">
                {Object.entries(MODELOS_VIAL).map(([id, m]) => (
                  <button key={id} onClick={() => setModeloId(id)} className={`${pill(modeloId === id)} !px-4 !py-2 !text-sm`}>{m.nome}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {campos.map((k) => (
                  <label key={k} className="text-xs font-medium text-slate-600">
                    {ROTULO_CAMPO[k] || k}
                    <input
                      value={atual.valores[k] ?? ''}
                      onChange={(e) => setAtual({ valores: { ...atual.valores, [k]: e.target.value } })}
                      placeholder={k === 'VALIDADE' || k === 'FABRICACAO' ? 'dd/mm/aa' : ''}
                      className={`mt-1 block w-40 ${inp}`}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>Tamanho (mm):</span>
                <input type="number" value={atual.largura} onChange={(e) => setAtual({ largura: e.target.value })} className={`w-16 ${inp}`} /> ×
                <input type="number" value={atual.altura} onChange={(e) => setAtual({ altura: e.target.value })} className={`w-16 ${inp}`} />
                <span className="text-slate-400">largura × altura</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>Resolução da Zebra:</span>
                <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className={inp}>
                  <option value={203}>203 dpi (8 pontos/mm)</option>
                  <option value={300}>300 dpi (12 pontos/mm)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={porUnidade} onChange={(e) => setPorUnidade(e.target.checked)} />
                Uma etiqueta por unidade do pedido (quantidade)
              </label>
              <button onClick={() => setEditarModelo((v) => !v)} className="text-xs text-slate-500 underline">
                {editarModelo ? 'Fechar edição do modelo' : 'Editar texto do modelo'}
              </button>
              {editarModelo && (
                <div>
                  <textarea
                    value={atual.texto}
                    onChange={(e) => setAtual({ texto: e.target.value })}
                    rows={11}
                    className="w-[340px] rounded-lg border border-slate-300 p-2 font-mono text-xs"
                  />
                  <div className="w-[340px] text-[11px] text-slate-400">
                    Automáticos: {'{PACIENTE} {MEDICO} {PEDIDO} {PRODUTO} {DOSAGEM}'}. Qualquer outro {'{CAMPO}'} vira um campo para preencher acima.
                    <button
                      onClick={() => setAtual({ texto: MODELOS_VIAL[modeloId].texto })}
                      className="ml-1 underline"
                    >
                      Voltar ao padrão
                    </button>
                  </div>
                </div>
              )}
              <div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => gerarVial('zpl')}
                    disabled={!selecionados.length || gerando || faltaCampo}
                    className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    title="Arquivo .zpl: vai direto para a impressora Zebra"
                  >
                    {gerando ? 'Gerando…' : `Gerar para Zebra (.zpl) · ${qtdEtiquetas} etiqueta(s)`}
                  </button>
                  <button
                    onClick={() => gerarVial('pdf')}
                    disabled={!selecionados.length || gerando || faltaCampo}
                    className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    PDF
                  </button>
                </div>
                {faltaCampo && <div className="mt-1 text-xs text-amber-700">Preencha {campos.map((k) => ROTULO_CAMPO[k] || k).join(', ')}.</div>}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-400">Prévia {exemplo ? `(${exemplo.pedido})` : ''}</div>
              <div
                className="overflow-hidden rounded-xl border-2 border-slate-800 bg-white p-1.5 font-bold leading-[1.18] text-black"
                style={{ width: 200, height: Math.round((200 * Number(atual.altura || 1)) / Number(atual.largura || 1)), fontSize: 10.5, fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {previa.map((l, i) => <div key={i} className={l.variavel ? 'break-words' : 'whitespace-pre'}>{l.txt || ' '}</div>)}
              </div>
              {/\{MEDICO\}/.test(atual.texto) && <div className="mt-1 w-[200px] text-[11px] text-slate-400">Médico e CRM vêm da última consulta GLP1 assinada do CPF.</div>}
            </div>
          </div>
        </Section>
      )}

      <Section
        title={`Pedidos · ${selecionados.length} selecionado(s)`}
        right={
          <input placeholder="Buscar nome, CPF, pedido ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PRODUTOS.map((f) => <button key={f.v} onClick={() => setProduto(f.v)} className={pill(produto === f.v)}>{f.label}</button>)}
          <span className="mx-1 text-slate-300">|</span>
          {ROTAS.map((f) => <button key={f.v} onClick={() => setRota(f.v)} className={pill(rota === f.v)}>{f.label}</button>)}
          <label className="ml-2 flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            <input type="checkbox" checked={soAbertos} onChange={(e) => setSoAbertos(e.target.checked)} /> Não concluído
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600">
            <option value="">Todos os status</option>
            {STATUS.map((s) => <option key={s.v} value={s.v}>{s.v}</option>)}
          </select>
        </div>

        <div className="mb-3 flex flex-wrap items-start gap-2">
          <textarea
            value={colar}
            onChange={(e) => setColar(e.target.value)}
            placeholder="Ou cole os números dos pedidos (S1890, 1891…)"
            rows={2}
            className="w-80 rounded-lg border border-slate-300 p-2 font-mono text-xs"
          />
          <button onClick={selecionarColados} disabled={!colar.trim()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">Selecionar colados</button>
          {sel.size > 0 && <button onClick={() => { setSel(new Set()); setAviso('') }} className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100">Limpar seleção</button>}
          {aviso && <div className="basis-full text-xs text-slate-500">{aviso}</div>}
        </div>

        {!dados ? (!erro && <Spinner />) : (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th><input type="checkbox" checked={todosVisiveis} onChange={alternarTodos} title="Selecionar todos da lista" /></Th>
                  <Th>Pedido</Th><Th>Data</Th><Th>Nome</Th><Th>Produto</Th><Th>Qtd</Th><Th>Status</Th><Th>Cidade</Th><Th>Rota</Th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && <tr><Td className="text-slate-400">Nada aqui.</Td></tr>}
                {lista.map((p) => (
                  <tr key={p.shopify_order_id} onClick={() => alternar(p.shopify_order_id)} className={`cursor-pointer ${sel.has(p.shopify_order_id) ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                    <Td><input type="checkbox" checked={sel.has(p.shopify_order_id)} onChange={() => alternar(p.shopify_order_id)} onClick={(e) => e.stopPropagation()} /></Td>
                    <Td className="whitespace-nowrap font-mono font-semibold text-ink-900">{p.pedido}</Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(p.created_at)}</Td>
                    <Td>{p.nome}</Td>
                    <Td className="whitespace-nowrap text-xs">{p.produto} {p.dosagem}</Td>
                    <Td className="text-xs">{p.quantidade}</Td>
                    <Td className="whitespace-nowrap text-xs"><span className={`rounded-full px-2 py-0.5 font-medium ${COR_STATUS[p.status_pedido] || 'bg-slate-100'}`}>{p.status_pedido}</span></Td>
                    <Td className="whitespace-nowrap text-xs">{p.cidade}/{p.uf}</Td>
                    <Td className="whitespace-nowrap text-xs">{p.rota === 'MOOVWAY/VERIFICAR' ? 'Moovway' : p.rota === 'DEDICADO' ? 'Dedicado' : p.rota === 'GOLLOG' ? 'Gollog' : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
