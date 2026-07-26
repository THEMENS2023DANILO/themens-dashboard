import { useState } from 'react'
import { supabase, fmtBRL, fmtDate, fmtDateTime } from '../supabase'
import { Card, Section, Spinner, Th, Td } from '../components/ui'

const onlyDigits = (s) => (s || '').replace(/\D/g, '')

// Tradução do payment_status do Nuvemshop (campo confiável; paid_at é vazio em pedidos antigos)
const PAY_LABEL = {
  paid: 'Pago',
  pending: 'Pendente',
  voided: 'Cancelado',
  refunded: 'Reembolsado',
  partially_refunded: 'Reemb. parcial',
  chargeback: 'Chargeback',
}

function fmtCPF(cpf) {
  const d = onlyDigits(cpf)
  if (d.length !== 11) return cpf || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Busca candidatos em themens_users por CPF, e-mail ou telefone
async function searchCandidates(raw) {
  const t = raw.trim()
  if (!t) return []
  const digits = onlyDigits(t)
  const ors = []
  if (t.includes('@')) ors.push(`email.ilike.%${t.toLowerCase()}%`)
  if (digits.length === 11) ors.push(`document.eq.${digits}`)
  if (digits.length >= 8) {
    let core = digits
    if (core.length > 11 && core.startsWith('55')) core = core.slice(2)
    ors.push(`phone.ilike.%${core}%`)
  }
  if (!ors.length) return []
  const { data } = await supabase
    .from('themens_users')
    .select('id, name, email, phone, document, birth_date')
    .or(ors.join(','))
    .limit(25)
  // dedup por CPF, mantendo o registro mais completo
  const byCpf = new Map()
  for (const u of data || []) {
    const key = u.document || u.id
    if (!byCpf.has(key)) byCpf.set(key, u)
  }
  return [...byCpf.values()]
}

// Carrega o perfil 360 de um CPF (pedidos, rastreios, consultas)
async function loadProfile(cpf, user) {
  const c = onlyDigits(cpf)
  const [ped, ras, cons] = await Promise.all([
    supabase
      .from('v_dash_pedidos')
      .select('numero_pedido, valor_total, created_at, paid_at, itens, qtd_itens, status, payment_status, cliente_nome')
      .eq('cliente_cpf', c)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('v_dash_rastreios')
      .select('codigo_rastreamento, url_rastreamento, numero_pedido, data_emissao, nome_transportador, brand, cliente_nome')
      .eq('cpf', c)
      .order('data_emissao', { ascending: false })
      .limit(500),
    supabase
      .from('v_dash_consultas')
      .select('appointment_code, tipo_consulta, condicao, medicamento, status, status_label, request_date, attend_date, medico_nome, prescription_products_list, paciente_nome')
      .eq('paciente_cpf', c)
      .order('request_date', { ascending: false })
      .limit(500),
  ])

  const pedidos = ped.data || []
  const rastreios = ras.data || []
  const consultas = cons.data || []

  const nome =
    user?.name ||
    pedidos.find((p) => p.cliente_nome)?.cliente_nome ||
    consultas.find((c) => c.paciente_nome)?.paciente_nome ||
    rastreios.find((r) => r.cliente_nome)?.cliente_nome ||
    null

  const pagos = pedidos.filter((p) => p.payment_status === 'paid')
  const totalPago = pagos.reduce((s, p) => s + Number(p.valor_total || 0), 0)

  // resumo de consultas por condição
  const porTipo = {}
  for (const cst of consultas) {
    const k = cst.condicao || cst.tipo_consulta || '—'
    porTipo[k] = (porTipo[k] || 0) + 1
  }

  return {
    cpf: c,
    user,
    nome,
    pedidos,
    rastreios,
    consultas,
    kpis: {
      totalPedidos: pedidos.length,
      pedidosPagos: pagos.length,
      totalPago,
      rastreios: rastreios.length,
      consultas: consultas.length,
    },
    porTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]),
  }
}

function StatusPill({ label, ok, warn }) {
  const cls = ok
    ? 'bg-emerald-100 text-emerald-700'
    : warn
    ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export default function Cliente() {
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState('idle') // idle | searching | choose | loading | ready | empty
  const [candidates, setCandidates] = useState([])
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  async function onSearch(e) {
    e?.preventDefault()
    const raw = input.trim()
    if (!raw) return
    setError('')
    setProfile(null)
    setCandidates([])
    setPhase('searching')

    try {
      const found = await searchCandidates(raw)
      const digits = onlyDigits(raw)

      if (found.length === 1) {
        await openProfile(found[0].document || digits, found[0])
      } else if (found.length > 1) {
        setCandidates(found)
        setPhase('choose')
      } else if (digits.length === 11) {
        // Sem cadastro em themens_users, mas pode ter pedidos/consultas sob esse CPF
        await openProfile(digits, null)
      } else {
        setPhase('empty')
      }
    } catch (err) {
      setError('Erro ao buscar. Tente novamente.')
      setPhase('idle')
    }
  }

  async function openProfile(cpf, user) {
    setPhase('loading')
    const p = await loadProfile(cpf, user)
    const vazio = !p.nome && !p.kpis.totalPedidos && !p.kpis.consultas && !p.kpis.rastreios
    if (vazio) {
      setPhase('empty')
      return
    }
    setProfile(p)
    setPhase('ready')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink-900">Cliente</h1>
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            autoFocus
            placeholder="CPF, e-mail ou telefone…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-80 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
            Buscar
          </button>
        </form>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {phase === 'idle' && (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Digite um CPF, e-mail ou telefone para ver o histórico completo do cliente.
        </div>
      )}

      {(phase === 'searching' || phase === 'loading') && <Spinner />}

      {phase === 'empty' && (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm">
          Nenhum cliente encontrado para <span className="font-semibold">{input.trim()}</span>.
        </div>
      )}

      {phase === 'choose' && (
        <Section title={`${candidates.length} clientes encontrados — selecione`}>
          <div className="divide-y divide-slate-100">
            {candidates.map((u) => (
              <button
                key={u.id}
                onClick={() => openProfile(u.document || onlyDigits(input), u)}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-slate-50"
              >
                <div>
                  <div className="font-medium text-ink-900">{u.name || '—'}</div>
                  <div className="text-xs text-slate-500">
                    {u.email || 'sem e-mail'} · {u.phone || 'sem telefone'}
                  </div>
                </div>
                <div className="whitespace-nowrap font-mono text-sm text-slate-600">{fmtCPF(u.document)}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {phase === 'ready' && profile && (
        <>
          {/* Cabeçalho do cliente */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-bold text-ink-900">{profile.nome || 'Cliente sem nome'}</div>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                  <span>CPF: <span className="font-mono text-slate-700">{fmtCPF(profile.cpf)}</span></span>
                  <span>
                    Nascimento:{' '}
                    <span className="text-slate-700">{profile.user?.birth_date ? fmtDate(profile.user.birth_date) : '—'}</span>
                  </span>
                  {profile.user?.email && <span>E-mail: <span className="text-slate-700">{profile.user.email}</span></span>}
                  {profile.user?.phone && <span>Telefone: <span className="text-slate-700">{profile.user.phone}</span></span>}
                </div>
                {!profile.user && (
                  <div className="mt-2 text-xs text-amber-600">Sem cadastro em themens_users — dados montados a partir de pedidos/consultas.</div>
                )}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Pedidos" value={profile.kpis.totalPedidos.toLocaleString('pt-BR')} sub={`${profile.kpis.pedidosPagos} pagos`} />
            <Card title="Total pago" value={fmtBRL(profile.kpis.totalPago)} accent="text-emerald-600" />
            <Card title="Rastreios" value={profile.kpis.rastreios.toLocaleString('pt-BR')} />
            <Card title="Consultas" value={profile.kpis.consultas.toLocaleString('pt-BR')} accent="text-brand-600" />
          </div>

          {/* Pedidos */}
          <Section title={`Pedidos (${profile.pedidos.length})`}>
            {profile.pedidos.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhum pedido.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Data</Th><Th>Pedido</Th><Th>Valor</Th><Th>Pagamento</Th><Th>Itens</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.pedidos.map((p, i) => (
                      <tr key={`${p.numero_pedido}-${i}`} className="hover:bg-slate-50 align-top">
                        <Td className="whitespace-nowrap">{fmtDate(p.created_at)}</Td>
                        <Td className="font-medium">#{p.numero_pedido}</Td>
                        <Td className="whitespace-nowrap font-semibold">{fmtBRL(Number(p.valor_total || 0))}</Td>
                        <Td>
                          <StatusPill label={PAY_LABEL[p.payment_status] || p.payment_status || '—'} ok={p.payment_status === 'paid'} warn={p.payment_status === 'pending'} />
                        </Td>
                        <Td className="max-w-md">{p.itens || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Rastreios */}
          <Section title={`Rastreios (${profile.rastreios.length}) — mais novos primeiro`}>
            {profile.rastreios.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhum rastreio.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Emissão NF</Th><Th>Rastreio</Th><Th>Pedido</Th><Th>Transportadora</Th><Th>Marca</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.rastreios.map((r, i) => (
                      <tr key={`${r.codigo_rastreamento}-${i}`} className="hover:bg-slate-50">
                        <Td className="whitespace-nowrap">{fmtDateTime(r.data_emissao)}</Td>
                        <Td className="font-medium">
                          {r.url_rastreamento
                            ? <a href={r.url_rastreamento} target="_blank" rel="noreferrer" className="text-brand-600 underline">{r.codigo_rastreamento}</a>
                            : r.codigo_rastreamento}
                        </Td>
                        <Td>#{r.numero_pedido || '—'}</Td>
                        <Td>{r.nome_transportador || '—'}</Td>
                        <Td>{r.brand || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Consultas */}
          <Section title={`Consultas médicas (${profile.consultas.length}) — mais novas primeiro`}>
            {profile.porTipo.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {profile.porTipo.map(([tipo, n]) => (
                  <span key={tipo} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {tipo}: <span className="text-ink-900">{n}</span>
                  </span>
                ))}
              </div>
            )}
            {profile.consultas.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhuma consulta.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Solicitada</Th><Th>Atendida</Th><Th>Condição</Th><Th>Status</Th><Th>Médico</Th><Th>Medicamento</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.consultas.map((c, i) => (
                      <tr key={`${c.appointment_code}-${i}`} className="hover:bg-slate-50 align-top">
                        <Td className="whitespace-nowrap">{fmtDate(c.request_date)}</Td>
                        <Td className="whitespace-nowrap">{fmtDate(c.attend_date)}</Td>
                        <Td className="font-medium">{c.condicao || c.tipo_consulta || '—'}</Td>
                        <Td>
                          <StatusPill label={c.status_label || String(c.status)} ok={c.status === 4} warn={c.status === 1} />
                        </Td>
                        <Td>{c.medico_nome || '—'}</Td>
                        <Td className="max-w-md">{c.medicamento || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
