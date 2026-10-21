import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtDateTime } from '../supabase'
import { Card, Spinner, Th, Td } from '../components/ui'
import { fmtCpf, semAcento } from '../lib/glp1'
import { useChargebacks, ChargebackBadge } from '../components/Chargeback'

// Check CPF: clientes que compraram GLP1 (Shopify) x dados da Receita Federal (API Consulta CPF do Serpro).
// Nascimento vem da avaliação médica (wl_avaliacoes_shopify; se faltar, do cadastro da plataforma).
// Consulta ao Serpro é cobrada por CPF: só roda quando alguém clica, e o resultado fica guardado (cpf_serpro).

const LOTE = 50

// 'AAAA-MM-DD' -> 'DD/MM/AAAA' sem passar por fuso horário
const fmtDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')

const COR_SITUACAO = {
  0: 'bg-emerald-100 text-emerald-700', // Regular
  2: 'bg-amber-100 text-amber-800', // Suspensa
  3: 'bg-red-100 text-red-700', // Titular falecido
  4: 'bg-amber-100 text-amber-800', // Pendente de regularização
  5: 'bg-red-100 text-red-700', // Cancelada por multiplicidade
  8: 'bg-red-100 text-red-700', // Nula
  9: 'bg-red-100 text-red-700', // Cancelada de ofício
}

function Confere({ v }) {
  if (v === true) return <span className="font-semibold text-emerald-600">✓</span>
  if (v === false) return <span className="font-semibold text-red-600">✗ diverge</span>
  return <span className="text-slate-300">—</span>
}

const COR_CARTAO = {
  confere: 'bg-emerald-100 text-emerald-700',
  parcial: 'bg-amber-100 text-amber-800',
  diverge: 'bg-red-100 text-red-700',
}
const TXT_CARTAO = { confere: '✓ confere', parcial: '~ parcial', diverge: '✗ diverge' }

// data e hora no fuso de SP
const fmtDiaSP = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const horaSP = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—')
const madrugada = (d) => {
  if (!d) return false
  const h = Number(new Date(d).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24
  return h >= 22 || h < 6
}
const ipOutroEstado = (r) => !!r.ip_uf && !!r.entrega_uf && r.ip_uf !== r.entrega_uf

const cpfConsultaDifere = (r) => !!r.cpf_consulta && r.cpf_consulta !== r.cpf

const temAlerta = (r) =>
  r.serpro_ok && (String(r.serpro_situacao_codigo) !== '0' || r.serpro_ano_obito || r.nome_confere === false || r.nascimento_confere === false)

const FILTROS = [
  { v: '', label: 'Todos' },
  { v: 'nao', label: 'Não consultados' },
  { v: 'alerta', label: 'Com alerta' },
  { v: 'chargeback', label: 'Chargeback' },
  { v: 'cartao', label: 'Cartão diverge' },
  { v: 'consulta', label: 'CPF consulta ≠ compra' },
  { v: 'ip', label: 'IP de outro estado' },
  { v: 'madrugada', label: 'Madrugada' },
  { v: 'erro', label: 'Erro na consulta' },
  { v: 'ok', label: 'Tudo certo' },
]

export default function CheckCpf() {
  const [linhas, setLinhas] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [rodando, setRodando] = useState(null) // { feitos, total }
  const [msg, setMsg] = useState(null)
  const [tick, setTick] = useState(0)
  const chargebacks = useChargebacks(tick)
  const cb = (r) => chargebacks.get(String(r.shopify_order_id))

  useEffect(() => {
    let vivo = true
    supabase.rpc('dash_check_cpf_v4', { p_limit: 5000 }).then(({ data, error }) => {
      if (!vivo) return
      if (error) { setErroCarga(error.message); return }
      setErroCarga('')
      setLinhas(data || [])
    })
    return () => { vivo = false }
  }, [tick])

  const lista = useMemo(() => {
    if (!linhas) return []
    const s = semAcento(busca.trim().toLowerCase())
    const sd = busca.replace(/\D/g, '')
    return linhas.filter((r) => {
      if (filtro === 'nao' && r.serpro_consultado_em) return false
      if (filtro === 'alerta' && !temAlerta(r)) return false
      if (filtro === 'chargeback' && !cb(r)) return false
      if (filtro === 'ip' && !ipOutroEstado(r)) return false
      if (filtro === 'madrugada' && !madrugada(r.comprado_em)) return false
      if (filtro === 'cartao' && r.cartao_confere !== 'diverge') return false
      if (filtro === 'consulta' && !cpfConsultaDifere(r)) return false
      if (filtro === 'erro' && !(r.serpro_consultado_em && !r.serpro_ok)) return false
      if (filtro === 'ok' && !(r.serpro_ok && !temAlerta(r))) return false
      if (!s) return true
      return (
        semAcento(`${r.nome_compra || ''} ${r.serpro_nome || ''} ${r.cartao_nome || ''}`).toLowerCase().includes(s) ||
        (sd && (r.cpf.includes(sd) || (r.pedido || '').replace(/\D/g, '') === sd))
      )
    })
  }, [linhas, busca, filtro, chargebacks])

  const resumo = useMemo(() => {
    const t = linhas || []
    return {
      total: t.length,
      nao: t.filter((r) => !r.serpro_consultado_em).length,
      alerta: t.filter(temAlerta).length,
      erro: t.filter((r) => r.serpro_consultado_em && !r.serpro_ok).length,
      cartao: t.filter((r) => r.cartao_confere === 'diverge').length,
      consulta: t.filter(cpfConsultaDifere).length,
    }
  }, [linhas])

  async function consultar(cpfs, forcar = false) {
    if (!cpfs.length) return
    const aviso = forcar
      ? `Consultar de novo ${cpfs.length} CPF(s) no Serpro? Cada consulta é cobrada.`
      : `Consultar ${cpfs.length} CPF(s) no Serpro? Cada consulta é cobrada (CPFs já consultados são pulados).`
    if (!window.confirm(aviso)) return
    setMsg(null)
    const tot = { consultados: 0, ja: 0, invalidos: 0, erros: 0 }
    let ambiente = ''
    try {
      for (let i = 0; i < cpfs.length; i += LOTE) {
        setRodando({ feitos: i, total: cpfs.length })
        const { data, error } = await supabase.functions.invoke('serpro-cpf', { body: { cpfs: cpfs.slice(i, i + LOTE), forcar } })
        let r = data
        if (error) {
          try { r = await error.context.json() } catch { r = { ok: false, erro: error.message } }
        }
        if (!r?.ok) throw new Error(r?.erro || 'falha desconhecida')
        ambiente = r.ambiente
        tot.consultados += r.consultados || 0
        tot.ja += r.ja_consultados || 0
        tot.invalidos += r.invalidos || 0
        tot.erros += r.erros || 0
      }
      const partes = [`${tot.consultados} consultado(s) no Serpro`]
      if (tot.ja) partes.push(`${tot.ja} já estavam consultados`)
      if (tot.invalidos) partes.push(`${tot.invalidos} com CPF inválido`)
      if (tot.erros) partes.push(`${tot.erros} com erro`)
      setMsg({ texto: `${partes.join(' · ')}${ambiente === 'trial' ? ' (ambiente de TESTE)' : ''}.` })
      setSel(new Set())
    } catch (e) {
      setMsg({ erro: true, texto: `Erro: ${e.message}` })
    } finally {
      setRodando(null)
      setTick((n) => n + 1)
    }
  }

  const alterna = (cpf) => setSel((s) => {
    const n = new Set(s)
    n.has(cpf) ? n.delete(cpf) : n.add(cpf)
    return n
  })
  const todosMarcados = lista.length > 0 && lista.every((r) => sel.has(r.cpf))
  const marcaTodos = () => setSel(todosMarcados ? new Set() : new Set(lista.map((r) => r.cpf)))
  const naoConsultadosVisiveis = lista.filter((r) => !r.serpro_consultado_em).map((r) => r.cpf)

  const pill = (ativo) => `rounded-full px-3 py-1 text-xs font-medium ${ativo ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
  const btn = 'rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Check CPF</h1>
        <div className="text-xs text-slate-400">
          Clientes que compraram GLP1, do mais recente para o mais antigo · nascimento da avaliação médica · nome no cartão do checkout Shopify · dados oficiais pela API Consulta CPF (Serpro / Receita Federal)
        </div>
      </div>

      {erroCarga && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro ao carregar: {erroCarga}</div>}

      {!linhas ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <button onClick={() => setFiltro('')} className="text-left [&>div]:h-full"><Card title="CPFs" value={resumo.total} sub="clientes únicos" /></button>
            <button onClick={() => setFiltro('nao')} className="text-left [&>div]:h-full"><Card title="Não consultados" value={resumo.nao} /></button>
            <button onClick={() => setFiltro('alerta')} className="text-left [&>div]:h-full"><Card title="Com alerta" value={resumo.alerta} sub="situação, óbito ou divergência" accent="text-red-600" /></button>
            <button onClick={() => setFiltro('cartao')} className="text-left [&>div]:h-full"><Card title="Cartão diverge" value={resumo.cartao} sub="nome do cartão ≠ titular" accent="text-red-600" /></button>
            <button onClick={() => setFiltro('consulta')} className="text-left [&>div]:h-full"><Card title="CPF consulta ≠ compra" value={resumo.consulta} sub="consulta médica com outro CPF" accent="text-red-600" /></button>
            <button onClick={() => setFiltro('erro')} className="text-left [&>div]:h-full"><Card title="Erro na consulta" value={resumo.erro} /></button>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, CPF ou pedido"
              className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button key={f.v} onClick={() => setFiltro(f.v)} className={pill(filtro === f.v)}>{f.label}</button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={() => consultar([...sel])}
                disabled={!sel.size || !!rodando}
                className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
              >
                Consultar selecionados ({sel.size})
              </button>
              <button
                onClick={() => consultar(naoConsultadosVisiveis)}
                disabled={!naoConsultadosVisiveis.length || !!rodando}
                className={`${btn} bg-white text-slate-700 hover:bg-slate-50`}
              >
                Consultar não consultados da lista ({naoConsultadosVisiveis.length})
              </button>
            </div>
          </div>

          {rodando && (
            <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
              Consultando no Serpro… {rodando.feitos} de {rodando.total}
            </div>
          )}
          {msg && (
            <div className={`rounded-lg p-3 text-sm ${msg.erro ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.texto}</div>
          )}

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="border-b border-slate-200 bg-slate-50 px-3 py-2" colSpan={11} />
                  <th className="border-b border-l border-slate-200 bg-brand-50 px-3 py-1 text-left text-xs font-bold uppercase tracking-wide text-brand-700" colSpan={8}>
                    Serpro — Receita Federal
                  </th>
                </tr>
                <tr>
                  <th className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <input type="checkbox" checked={todosMarcados} onChange={marcaTodos} />
                  </th>
                  <Th>Pedido</Th>
                  <Th>Data</Th>
                  <Th>Horário</Th>
                  <Th>Nome (compra)</Th>
                  <Th>CPF</Th>
                  <Th>CPF consulta médica</Th>
                  <Th>Nascimento (avaliação)</Th>
                  <Th>IP da compra × entrega</Th>
                  <Th>Nome no cartão</Th>
                  <Th>Confere cartão</Th>
                  <Th>Nome na Receita</Th>
                  <Th>Confere nome</Th>
                  <Th>Situação</Th>
                  <Th>Nascimento</Th>
                  <Th>Confere nasc.</Th>
                  <Th>Óbito</Th>
                  <Th>Consultado em</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.cpf} className={temAlerta(r) ? 'bg-red-50/40' : ''}>
                    <Td><input type="checkbox" checked={sel.has(r.cpf)} onChange={() => alterna(r.cpf)} /></Td>
                    <Td className="whitespace-nowrap font-medium">
                      {r.pedido}
                      <ChargebackBadge info={cb(r)} />
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{fmtDiaSP(r.comprado_em)}</Td>
                    <Td className="whitespace-nowrap">
                      {madrugada(r.comprado_em)
                        ? <span title="Compra entre 22h e 6h" className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{horaSP(r.comprado_em)}</span>
                        : <span className="text-slate-500">{horaSP(r.comprado_em)}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{r.nome_compra || '—'}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{fmtCpf(r.cpf)}</Td>
                    <Td className="whitespace-nowrap">
                      {!r.cpf_consulta ? (
                        <span className="text-xs text-slate-400">sem consulta</span>
                      ) : cpfConsultaDifere(r) ? (
                        <span title={`Consulta de ${fmtDateTime(r.consulta_em)} · paciente achado pelo ${r.consulta_vinculo} da compra`}>
                          <span className="font-mono text-xs font-semibold text-red-600">{fmtCpf(r.cpf_consulta)}</span>
                          <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">≠ compra · {r.consulta_vinculo}</span>
                        </span>
                      ) : (
                        <span title={`Consulta de ${fmtDateTime(r.consulta_em)}`} className="text-xs font-semibold text-emerald-600">✓ mesmo CPF</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDia(r.nascimento_avaliacao)}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      <div className="font-mono text-slate-500">{r.ip_compra || '—'}</div>
                      <div title="Localização aproximada do IP (operadora de celular pode aparecer em outra cidade)">
                        IP: {[r.ip_cidade, r.ip_uf].filter(Boolean).join('/') || '—'}
                      </div>
                      <div className="text-slate-500">Entrega: {[r.entrega_cidade, r.entrega_uf].filter(Boolean).join('/') || '—'}</div>
                      {ipOutroEstado(r) && <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">≠ estado</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.cartao_nome ? (
                        <>
                          <div>{r.cartao_nome}</div>
                          <div className="text-xs text-slate-400">{[r.cartao_bandeira, r.cartao_final && `•••• ${r.cartao_final}`].filter(Boolean).join(' · ')}</div>
                        </>
                      ) : <span className="text-xs text-slate-400">{/pix/i.test(r.gateway || '') ? 'PIX' : /pagaleve/i.test(r.gateway || '') ? 'Pagaleve' : '—'}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.cartao_confere ? (
                        <span
                          title={r.serpro_ok ? 'Comparado com o nome na Receita' : 'Comparado com o nome da compra (CPF ainda não consultado no Serpro)'}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_CARTAO[r.cartao_confere]}`}
                        >
                          {TXT_CARTAO[r.cartao_confere]}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </Td>
                    {r.serpro_consultado_em && !r.serpro_ok ? (
                      <td colSpan={6} className="border-b border-slate-100 px-3 py-2 text-xs text-red-600">{r.serpro_erro}</td>
                    ) : (
                      <>
                        <Td className="whitespace-nowrap">{r.serpro_nome || <span className="text-slate-300">—</span>}</Td>
                        <Td className="text-center"><Confere v={r.nome_confere} /></Td>
                        <Td className="whitespace-nowrap">
                          {r.serpro_situacao ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[r.serpro_situacao_codigo] || 'bg-slate-100 text-slate-600'}`}>
                              {r.serpro_situacao}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDia(r.serpro_nascimento)}</Td>
                        <Td className="text-center"><Confere v={r.nascimento_confere} /></Td>
                        <Td className={r.serpro_ano_obito ? 'font-semibold text-red-600' : 'text-slate-300'}>{r.serpro_ano_obito || '—'}</Td>
                      </>
                    )}
                    <Td className="whitespace-nowrap text-xs text-slate-500">{r.serpro_consultado_em ? fmtDateTime(r.serpro_consultado_em) : '—'}</Td>
                    <Td>
                      <button
                        onClick={() => consultar([r.cpf], !!r.serpro_consultado_em)}
                        disabled={!!rodando}
                        className="whitespace-nowrap rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {r.serpro_consultado_em ? 'Consultar de novo' : 'Consultar'}
                      </button>
                    </Td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr><td colSpan={19} className="py-10 text-center text-sm text-slate-400">Nenhum cliente nesse filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
