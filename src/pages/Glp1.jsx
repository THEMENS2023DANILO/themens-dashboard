import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtBRL, fmtDate, fmtDateTime } from '../supabase'
import { Card, Section, Spinner, Th, Td } from '../components/ui'

// Pedidos GLP1 da loja Shopify (tabela shopify_glp1), do mais recente para o mais antigo.
// Dados: função public.dash_glp1_pedidos (só usuários logados).
// Número do pedido com "S" na frente = Shopify.

const ROTAS = [
  { v: '', label: 'Todas' },
  { v: 'DEDICADO', label: 'Dedicado' },
  { v: 'GOLLOG', label: 'Gollog' },
  { v: 'MOOVWAY/VERIFICAR', label: 'Moovway / Verificar' },
]

const COR_ROTA = {
  DEDICADO: 'bg-emerald-100 text-emerald-700',
  GOLLOG: 'bg-orange-100 text-orange-700',
  'MOOVWAY/VERIFICAR': 'bg-violet-100 text-violet-700',
}

function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || '—'
}

function statusPedido(p) {
  if (p.cancelled_at) return { txt: 'Cancelado', cor: 'bg-red-100 text-red-700' }
  if (p.financial_status === 'refunded') return { txt: 'Reembolsado', cor: 'bg-red-100 text-red-700' }
  if (p.financial_status === 'pending') return { txt: 'Aguardando pgto', cor: 'bg-amber-100 text-amber-700' }
  if (p.fulfillment_status === 'fulfilled') return { txt: 'Enviado', cor: 'bg-slate-200 text-slate-700' }
  return { txt: 'Pago', cor: 'bg-blue-100 text-blue-700' }
}

function baixarCsv(lista) {
  const cols = [
    ['Pedido', (p) => p.pedido], ['Data', (p) => fmtDateTime(p.created_at)], ['Nome', (p) => p.nome],
    ['CPF', (p) => fmtCpf(p.cpf)], ['Item', (p) => p.item], ['Endereço', (p) => p.endereco],
    ['Cidade', (p) => p.cidade], ['UF', (p) => p.uf], ['CEP', (p) => p.cep],
    ['Prescrição', (p) => (p.data_prescricao ? fmtDate(`${p.data_prescricao}T12:00:00`) : 'Não')],
    ['Rota', (p) => p.rota], ['Motivo rota', (p) => p.rota_motivo],
    ['Km Vila Olímpia', (p) => p.dist_vila_olimpia_km ?? ''], ['Aeroporto', (p) => p.aeroporto_iata ?? ''],
    ['Total', (p) => p.total], ['Status', (p) => statusPedido(p).txt],
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

export default function Glp1() {
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [rota, setRota] = useState('')
  const [busca, setBusca] = useState('')
  const [soSemRx, setSoSemRx] = useState(false)
  const [ocultarCancelados, setOcultarCancelados] = useState(true)
  const [tick, setTick] = useState(0)

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

  const lista = useMemo(() => {
    if (!dados) return []
    const s = busca.trim().toLowerCase()
    const sd = s.replace(/\D/g, '')
    return dados.lista.filter((p) => {
      if (rota && p.rota !== rota) return false
      if (soSemRx && p.data_prescricao) return false
      if (ocultarCancelados && (p.cancelled_at || p.financial_status === 'refunded')) return false
      if (!s) return true
      return (
        (p.nome || '').toLowerCase().includes(s) ||
        (p.cidade || '').toLowerCase().includes(s) ||
        (sd && ((p.cpf || '').includes(sd) || (p.pedido || '').replace(/\D/g, '') === sd))
      )
    })
  }, [dados, rota, busca, soSemRx, ocultarCancelados])

  const r = dados?.resumo

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">GLP1 — Pedidos Shopify</h1>
          <div className="text-xs text-slate-400">
            Pedidos entram em tempo real pelo webhook do Shopify · tela atualiza a cada 1 min · último pedido: {fmtDateTime(r?.ultimo_pedido)}
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Card title="Pedidos GLP1" value={r.total} sub="todos os pedidos Shopify" />
            <Card title="Dedicado" value={r.dedicado} sub="cidade de SP ou até 150 km" accent="text-emerald-600" />
            <Card title="Gollog" value={r.gollog} sub="fora de SP, perto de aeroporto" accent="text-orange-600" />
            <Card title="Moovway / Verificar" value={r.moovway} sub="restante" accent="text-violet-600" />
            <Card title="Sem prescrição" value={r.sem_prescricao} sub="CPF sem consulta GLP1 assinada" accent="text-red-600" />
          </div>

          <Section
            title={`${lista.length} pedidos`}
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
                <button
                  key={f.v}
                  onClick={() => setRota(f.v)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    rota === f.v ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <label className="ml-3 flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={soSemRx} onChange={(e) => setSoSemRx(e.target.checked)} />
                Só sem prescrição
              </label>
              <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={ocultarCancelados} onChange={(e) => setOcultarCancelados(e.target.checked)} />
                Ocultar cancelados/reembolsados
              </label>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <Th>Pedido</Th><Th>Data</Th><Th>Nome</Th><Th>CPF</Th><Th>Item</Th><Th>Endereço</Th>
                    <Th>Prescrição</Th><Th>Rota</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 && (
                    <tr><Td className="text-slate-400">Nada aqui.</Td></tr>
                  )}
                  {lista.map((p) => {
                    const st = statusPedido(p)
                    return (
                      <tr key={p.shopify_order_id} className="align-top hover:bg-slate-50">
                        <Td className="whitespace-nowrap font-mono font-semibold text-ink-900">{p.pedido}</Td>
                        <Td className="text-xs">{fmtDateTime(p.created_at)}</Td>
                        <Td className="min-w-[130px]">{p.nome || '—'}</Td>
                        <Td className="whitespace-nowrap font-mono text-xs">{fmtCpf(p.cpf)}</Td>
                        <Td className="min-w-[180px] max-w-[220px] text-xs">
                          <div className="font-medium text-ink-900">
                            {p.produto}{p.dosagem ? ` ${p.dosagem}` : ''}{p.quantidade > 1 ? ` · ${p.quantidade} un.` : ''}
                          </div>
                          <div className="truncate text-slate-400" title={p.item}>{p.item}</div>
                          <div className="text-slate-500">{fmtBRL(Number(p.total))}</div>
                        </Td>
                        <Td className="min-w-[200px] max-w-[240px] text-xs text-slate-600">
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
                        <Td className="whitespace-nowrap text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${st.cor}`}>{st.txt}</span>
                          {p.nf_numero && <div className="mt-1 text-slate-500">NF {p.nf_numero}</div>}
                          {p.minuta_num && <div className="mt-1 text-slate-500">Minuta {p.minuta_num}</div>}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
