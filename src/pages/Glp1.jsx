import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtBRL, fmtDate, fmtDateTime } from '../supabase'
import { Card, Section, Spinner, Th, Td } from '../components/ui'
import { STATUS, COR_STATUS, PRODUTOS, ROTAS, emRota, ehPago, fmtCpf, bateBusca } from '../lib/glp1'

// Pedidos GLP1 da loja Shopify (tabela shopify_glp1), do mais recente para o mais antigo.
// Dados: função public.dash_glp1_pedidos (só usuários logados).
// Só entram pedidos PAGOS no Shopify. Número do pedido com "S" na frente = Shopify.

const COR_ROTA = {
  DEDICADO: 'bg-emerald-100 text-emerald-700',
  GOLLOG: 'bg-orange-100 text-orange-700',
  'MOOVWAY/VERIFICAR': 'bg-violet-100 text-violet-700',
}

const ROTA_OPCAO = '__em_rota'

function statusShopify(p) {
  if (p.financial_status === 'partially_refunded') return 'Pago (reembolso parcial)'
  if (p.fulfillment_status === 'fulfilled') return 'Pago · enviado'
  return 'Pago'
}

function baixarCsv(lista) {
  const cols = [
    ['Pedido', (p) => p.pedido], ['Data', (p) => fmtDateTime(p.created_at)], ['Nome', (p) => p.nome],
    ['CPF', (p) => fmtCpf(p.cpf)], ['Produto', (p) => p.produto], ['Dosagem', (p) => p.dosagem], ['Item', (p) => p.item],
    ['Endereço', (p) => p.endereco], ['Cidade', (p) => p.cidade], ['UF', (p) => p.uf], ['CEP', (p) => p.cep],
    ['Prescrição', (p) => (p.data_prescricao ? fmtDate(`${p.data_prescricao}T12:00:00`) : 'Não')],
    ['Rota', (p) => p.rota], ['Motivo rota', (p) => p.rota_motivo],
    ['Km Vila Olímpia', (p) => p.dist_vila_olimpia_km ?? ''], ['Aeroporto', (p) => p.aeroporto_iata ?? ''],
    ['Total', (p) => p.total], ['Status do pedido', (p) => p.status_pedido],
    ['Transportadora', (p) => p.status_transportadora ?? ''], ['Rastreio', (p) => p.status_rastreio ?? ''],
  ]
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.map((c) => esc(c[0])).join(';'), ...lista.map((p) => cols.map((c) => esc(c[1](p))).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `glp1-shopify-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Janela para informar rastreio e transportadora ao colocar o pedido "Em Rota"
function ModalRota({ pedido, onCancelar, onSalvar, salvando, erro }) {
  const [transp, setTransp] = useState(pedido.status_transportadora || (pedido.rota === 'GOLLOG' ? 'Gollog' : 'Moovway'))
  const [cod, setCod] = useState(pedido.status_rastreio || '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSalvar(transp, cod) }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-1 text-lg font-semibold text-ink-900">Em Rota · {pedido.pedido}</div>
        <div className="mb-4 text-xs text-slate-500">{pedido.nome} · {pedido.cidade}/{pedido.uf}</div>

        <div className="mb-1 text-sm font-medium">Transportadora</div>
        <div className="mb-4 flex gap-2">
          {['Moovway', 'Gollog'].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTransp(t)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                transp === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium">Código de rastreamento</label>
        <input
          autoFocus
          value={cod}
          onChange={(e) => setCod(e.target.value.toUpperCase())}
          placeholder="Deixe em branco se ainda não tem"
          className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="mb-4 text-xs text-slate-400">
          Fica como {cod.trim() ? <b>Em Rota (COM RASTREIO)</b> : <b>Em Rota (SEM RASTREIO)</b>}
        </div>

        {erro && <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{erro}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button disabled={salvando} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Glp1() {
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [rota, setRota] = useState('')
  const [produto, setProduto] = useState('')
  const [busca, setBusca] = useState('')
  const [soSemRx, setSoSemRx] = useState(false)
  const [soAbertos, setSoAbertos] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [salvando, setSalvando] = useState(null)
  const [erroStatus, setErroStatus] = useState('')
  const [modalRota, setModalRota] = useState(null)
  const [tick, setTick] = useState(0)

  async function salvarStatus(p, novo, transportadora = null, rastreio = null) {
    setSalvando(p.shopify_order_id)
    setErroStatus('')
    const { error } = await supabase.rpc('glp1_atualizar_status', {
      p_ids: [p.shopify_order_id], p_status: novo, p_rastreio: rastreio, p_transportadora: transportadora,
    })
    setSalvando(null)
    if (error) { setErroStatus(`Não salvou o status do ${p.pedido}: ${error.message}`); return false }
    const rota = emRota(novo)
    setDados((d) => ({
      ...d,
      lista: d.lista.map((x) => x.shopify_order_id === p.shopify_order_id
        ? {
            ...x, status_pedido: novo, status_aberto: novo !== 'Concluído', status_origem: 'dashboard',
            status_atualizado_em: new Date().toISOString(),
            status_rastreio: rota ? (rastreio || null) : x.status_rastreio,
            status_transportadora: rota ? transportadora : x.status_transportadora,
          }
        : x),
    }))
    return true
  }

  function escolherStatus(p, valor) {
    if (valor === ROTA_OPCAO) { setErroStatus(''); setModalRota(p); return }
    if (valor === p.status_pedido) return
    salvarStatus(p, valor)
  }

  async function salvarRota(transp, cod) {
    const novo = cod.trim() ? 'Em Rota (COM RASTREIO)' : 'Em Rota (SEM RASTREIO)'
    if (await salvarStatus(modalRota, novo, transp, cod.trim() || null)) setModalRota(null)
  }

  // atualiza sozinho a cada 1 minuto (pedidos chegam pelo webhook do Shopify)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let vivo = true
    supabase.rpc('dash_glp1_pedidos', { p_busca: null, p_rota: null, p_limit: 5000 }).then(({ data, error }) => {
      if (!vivo) return
      if (error) { setErroCarga(error.message); return }
      setErroCarga('')
      setDados(data)
    })
    return () => { vivo = false }
  }, [tick])

  // só pedidos pagos no Shopify (e do produto escolhido)
  const pagos = useMemo(
    () => (dados ? dados.lista.filter((p) => ehPago(p) && (!produto || p.produto === produto)) : []),
    [dados, produto],
  )

  const lista = useMemo(() => pagos.filter((p) => {
    if (rota && p.rota !== rota) return false
    if (soSemRx && p.data_prescricao) return false
    if (soAbertos && !p.status_aberto) return false
    if (filtroStatus && p.status_pedido !== filtroStatus) return false
    return bateBusca(p, busca)
  }), [pagos, rota, busca, soSemRx, soAbertos, filtroStatus])

  // cartões: sempre só os NÃO concluídos
  const abertos = pagos.filter((p) => p.status_aberto)
  const cont = {
    abertos: abertos.length,
    dedicado: abertos.filter((p) => p.rota === 'DEDICADO').length,
    gollog: abertos.filter((p) => p.rota === 'GOLLOG').length,
    moovway: abertos.filter((p) => p.rota === 'MOOVWAY/VERIFICAR').length,
    semRx: abertos.filter((p) => !p.data_prescricao).length,
  }
  const filtrarCartao = (r, semRx = false) => { setSoAbertos(true); setRota(r); setSoSemRx(semRx); setFiltroStatus('') }

  const pill = (ativo) => `rounded-full px-3 py-1 text-xs font-medium ${ativo ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">GLP1 — Pedidos Shopify</h1>
          <div className="text-xs text-slate-400">
            Só pedidos pagos · entram em tempo real pelo webhook do Shopify · tela atualiza a cada 1 min · último pedido: {fmtDateTime(dados?.resumo?.ultimo_pedido)}
          </div>
        </div>
        <button
          onClick={() => baixarCsv(lista)}
          disabled={!lista.length}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Baixar CSV ({lista.length})
        </button>
      </div>

      {erroCarga && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro ao carregar: {erroCarga}</div>}

      {!dados ? <Spinner /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <span className="text-sm font-semibold text-ink-900">Produto</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              {PRODUTOS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => setProduto(f.v)}
                  className={`px-4 py-2 text-sm font-semibold transition ${
                    produto === f.v ? 'bg-ink-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label} <span className="font-normal opacity-70">({dados.lista.filter((p) => ehPago(p) && (!f.v || p.produto === f.v)).length})</span>
                </button>
              ))}
            </div>
            {produto && <span className="text-xs text-slate-500">Cartões e lista mostram só {produto}.</span>}
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="[&>div]:h-full"><Card title="Pedidos pagos" value={pagos.length} sub={produto ? `${produto} · todos` : 'todos os pagos no Shopify'} /></div>
            {[
              ['Não concluídos', cont.abertos, 'em aberto', 'text-amber-600', () => filtrarCartao('')],
              ['Dedicado', cont.dedicado, 'não concluídos · SP até 150 km', 'text-emerald-600', () => filtrarCartao('DEDICADO')],
              ['Gollog', cont.gollog, 'não concluídos · perto de aeroporto', 'text-orange-600', () => filtrarCartao('GOLLOG')],
              ['Moovway / Verificar', cont.moovway, 'não concluídos · restante', 'text-violet-600', () => filtrarCartao('MOOVWAY/VERIFICAR')],
              ['Sem prescrição', cont.semRx, 'não concluídos sem consulta GLP1', 'text-red-600', () => filtrarCartao('', true)],
            ].map(([t, v, sub, cor, fn]) => (
              <button key={t} onClick={fn} className="text-left transition hover:opacity-80 [&>div]:h-full" title="Clique para filtrar a lista">
                <Card title={t} value={v} sub={sub} accent={cor} />
              </button>
            ))}
          </div>

          <Section
            title={`${lista.length} pedidos${produto ? ` · ${produto}` : ''}`}
            right={
              <input
                placeholder="Buscar nome, CPF, pedido ou cidade…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              />
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {ROTAS.map((f) => (
                <button key={f.v} onClick={() => setRota(f.v)} className={pill(rota === f.v)}>{f.label}</button>
              ))}
              <label className="ml-3 flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                <input type="checkbox" checked={soAbertos} onChange={(e) => setSoAbertos(e.target.checked)} />
                Não concluído
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
              >
                <option value="">Todos os status</option>
                {STATUS.map((s) => s.v).map((v) => (
                  <option key={v} value={v}>{v} ({pagos.filter((p) => p.status_pedido === v).length})</option>
                ))}
              </select>
              <label className="ml-3 flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={soSemRx} onChange={(e) => setSoSemRx(e.target.checked)} />
                Só sem prescrição
              </label>
            </div>

            {erroStatus && <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{erroStatus}</div>}

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <Th>Pedido</Th><Th>Data</Th><Th>Status do pedido</Th><Th>Nome</Th><Th>CPF</Th><Th>Item</Th><Th>Endereço</Th>
                    <Th>Prescrição</Th><Th>Rota</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 && (
                    <tr><Td className="text-slate-400">Nada aqui.</Td></tr>
                  )}
                  {lista.map((p) => (
                    <tr key={p.shopify_order_id} className="align-top hover:bg-slate-50">
                      <Td className="whitespace-nowrap font-mono font-semibold text-ink-900">{p.pedido}</Td>
                      <Td className="text-xs">{fmtDateTime(p.created_at)}</Td>
                      <Td className="text-xs">
                        <select
                          value={emRota(p.status_pedido) ? ROTA_OPCAO : (p.status_pedido || 'Sem status')}
                          disabled={salvando === p.shopify_order_id}
                          onChange={(e) => escolherStatus(p, e.target.value)}
                          className={`w-[185px] cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${COR_STATUS[p.status_pedido] || 'bg-slate-100'}`}
                        >
                          {STATUS.filter((s) => !emRota(s.v)).map((s) => (
                            s.v === 'Concluído'
                              ? [<option key={ROTA_OPCAO} value={ROTA_OPCAO}>{emRota(p.status_pedido) ? p.status_pedido : 'Em Rota…'}</option>,
                                 <option key={s.v} value={s.v}>{s.v}</option>]
                              : <option key={s.v} value={s.v}>{s.v}</option>
                          ))}
                        </select>
                        {emRota(p.status_pedido) && (
                          <button
                            onClick={() => { setErroStatus(''); setModalRota(p) }}
                            className="mt-1 block whitespace-nowrap text-left font-medium text-indigo-700 hover:underline"
                            title="Editar transportadora / rastreio"
                          >
                            {p.status_transportadora || 'Transportadora?'} · {p.status_rastreio || 'sem rastreio'} ✎
                          </button>
                        )}
                        {p.status_atualizado_em && (
                          <div
                            className="mt-1 whitespace-nowrap text-slate-400"
                            title={`Atualizado por ${p.status_atualizado_por || '—'} em ${fmtDateTime(p.status_atualizado_em)}`}
                          >
                            {p.status_origem === 'planilha' ? 'via planilha' : p.status_origem === 'presumido' ? 'presumido (antigo)' : `por ${(p.status_atualizado_por || '').split('@')[0]}`}
                          </div>
                        )}
                        <div className="mt-1 whitespace-nowrap text-slate-400">Shopify: {statusShopify(p)}</div>
                        {p.nf_numero && <div className="whitespace-nowrap text-slate-500">NF {p.nf_numero}</div>}
                        {p.minuta_num && <div className="whitespace-nowrap text-slate-500">Minuta {p.minuta_num}</div>}
                      </Td>
                      <Td className="min-w-[110px]">{p.nome || '—'}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{fmtCpf(p.cpf)}</Td>
                      <Td className="min-w-[140px] max-w-[180px] text-xs">
                        <div className="font-medium text-ink-900">
                          {p.produto}{p.dosagem ? ` ${p.dosagem}` : ''}{p.quantidade > 1 ? ` · ${p.quantidade} un.` : ''}
                        </div>
                        <div className="truncate text-slate-400" title={p.item}>{p.item}</div>
                        <div className="text-slate-500">{fmtBRL(Number(p.total))}</div>
                      </Td>
                      <Td className="min-w-[160px] max-w-[200px] text-xs text-slate-600">
                        <div>{p.end_rua}, {p.end_numero}{p.end_complemento ? ` — ${p.end_complemento}` : ''}</div>
                        <div>{p.end_bairro}{p.end_bairro ? ' · ' : ''}{p.cidade}/{p.uf} · {p.cep}</div>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {p.data_prescricao ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                            Sim · {fmtDate(`${p.data_prescricao}T12:00:00`)}
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700"
                            title={p.data_consulta_qualquer ? `Tem consulta de outro tratamento em ${fmtDate(`${p.data_consulta_qualquer}T12:00:00`)}` : 'Nenhuma consulta assinada para este CPF'}
                          >
                            Não
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${COR_ROTA[p.rota] || 'bg-slate-100'}`}>
                          {p.rota === 'MOOVWAY/VERIFICAR' ? 'Moovway/Verificar' : p.rota === 'DEDICADO' ? 'Dedicado' : p.rota === 'GOLLOG' ? 'Gollog' : '—'}
                        </span>
                        <div className="mt-1 text-slate-400">
                          {p.rota === 'GOLLOG'
                            ? `${p.aeroporto_iata} · ${p.aeroporto_dist_km} km`
                            : p.dist_vila_olimpia_km != null ? `${Math.round(p.dist_vila_olimpia_km)} km da V. Olímpia` : p.rota_motivo}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {modalRota && (
        <ModalRota
          pedido={modalRota}
          salvando={salvando === modalRota.shopify_order_id}
          erro={erroStatus}
          onCancelar={() => setModalRota(null)}
          onSalvar={salvarRota}
        />
      )}
    </div>
  )
}
