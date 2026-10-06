import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtDate, fmtDateTime, todaySP } from '../supabase'
import { Card, Section, Spinner, Th, Td, BarList } from '../components/ui'

// Avaliações de emagrecimento (site theladies) x envio automático ao portal consultoriomedico.digital
// Dados: função public.dash_avaliacoes_portal (só usuários logados)

const FILTROS = [
  { v: 'pendencias', label: 'Fila + Erros' },
  { v: 'Não enviado', label: 'Na fila' },
  { v: 'Erro', label: 'Erro' },
  { v: 'Negada', label: 'Negada' },
  { v: 'OK', label: 'Subiu (OK)' },
  { v: 'Duplicada', label: 'Duplicada' },
  { v: '', label: 'Todas' },
]

function diasAtras(base, n) {
  const d = new Date(`${base}T12:00:00`)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// período: [de, ate] em datas de São Paulo; Total = sem limite
function periodo(p) {
  const hoje = todaySP()
  if (p === 'hoje') return [hoje, hoje]
  if (p === 'ontem') return [diasAtras(hoje, 1), diasAtras(hoje, 1)]
  if (p === '7d') return [diasAtras(hoje, 6), hoje]
  return [null, null]
}

const PERIODOS = [
  { v: 'hoje', label: 'Hoje' },
  { v: 'ontem', label: 'Ontem' },
  { v: '7d', label: '7 dias' },
  { v: 'total', label: 'Total' },
]

const COR = {
  OK: 'bg-emerald-100 text-emerald-700',
  'Não enviado': 'bg-amber-100 text-amber-700',
  Enviando: 'bg-blue-100 text-blue-700',
  Erro: 'bg-red-100 text-red-700',
  Negada: 'bg-slate-200 text-slate-700',
  Duplicada: 'bg-slate-100 text-slate-500',
}

export default function Avaliacoes() {
  const [per, setPer] = useState('hoje')
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [filtro, setFiltro] = useState('pendencias')
  const [busca, setBusca] = useState('')
  const [tick, setTick] = useState(0)

  // atualiza sozinho a cada 1 minuto
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let vivo = true
    const [de, ate] = periodo(per)
    supabase.rpc('dash_avaliacoes_portal', { p_de: de, p_ate: ate }).then(({ data, error }) => {
      if (!vivo) return
      if (error) { setErroCarga(error.message); return }
      setErroCarga('')
      setDados(data)
    })
    return () => { vivo = false }
  }, [per, tick])

  const lista = useMemo(() => {
    if (!dados) return []
    const s = busca.trim().toLowerCase()
    const sd = s.replace(/\D/g, '')
    return dados.lista.filter((r) => {
      if (filtro === 'pendencias' && !['Não enviado', 'Enviando', 'Erro'].includes(r.portal_status)) return false
      if (filtro === 'Não enviado' && !['Não enviado', 'Enviando'].includes(r.portal_status)) return false
      if (filtro && !['pendencias', 'Não enviado'].includes(filtro) && r.portal_status !== filtro) return false
      if (s && !((r.nome || '').toLowerCase().includes(s) || (sd && (r.cpf || '').replace(/\D/g, '').includes(sd)))) return false
      return true
    })
  }, [dados, filtro, busca])

  const r = dados?.resumo
  const noPeriodo = per !== 'total'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Avaliações → Portal</h1>
          <div className="text-xs text-slate-400">
            Envio automático de hora em hora · tela atualiza a cada 1 min · última atividade do robô: {fmtDateTime(r?.ultima_atividade)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPer(p.v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                per === p.v ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {erroCarga && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro ao carregar: {erroCarga}</div>}

      {!dados ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Card title="Subiram (OK)" value={r.ok} sub={noPeriodo ? 'enviadas ao portal no período' : 'total enviado ao portal'} accent="text-emerald-600" />
            <Card title="Na fila" value={r.fila} sub={noPeriodo ? `concluídas no período · ${r.fila_total} na fila no total` : (r.enviando ? `${r.enviando} enviando agora` : 'sobem na próxima rodada')} accent="text-amber-600" />
            <Card title="Com erro" value={r.erro} sub={noPeriodo ? `concluídas no período · ${r.erro_total} com erro no total` : 'precisam de correção'} accent="text-red-600" />
            <Card title="Negadas" value={r.negada} sub="incompatíveis (portal recusou)" />
            <Card title="Duplicadas" value={r.duplicada} sub="mesmo CPF já enviado" />
            <Card title={noPeriodo ? 'Concluídas no período' : 'Concluídas'} value={r.concluidas} sub={`${r.em_andamento} em andamento · ${r.bloqueadas} bloqueadas`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Section title="Envios por dia (OK)">
              <BarList items={[...dados.por_dia].reverse().slice(0, 15).map((d) => ({ label: fmtDate(`${d.dia}T12:00:00`), value: d.ok }))} />
            </Section>

            <div className="lg:col-span-2">
              <Section
                title={`${lista.length} avaliações`}
                right={
                  <input
                    placeholder="Buscar nome ou CPF…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  />
                }
              >
                <div className="mb-3 flex flex-wrap gap-2">
                  {FILTROS.map((f) => (
                    <button
                      key={f.v}
                      onClick={() => setFiltro(f.v)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        filtro === f.v ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0">
                      <tr>
                        <Th>Concluída</Th><Th>Paciente</Th><Th>CPF</Th><Th>Portal</Th><Th>Detalhe</Th><Th>Tent.</Th><Th>Atualizado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.length === 0 && (
                        <tr><Td className="text-slate-400">Nada aqui.</Td></tr>
                      )}
                      {lista.map((a) => (
                        <tr key={a.id} className="align-top hover:bg-slate-50">
                          <Td className="whitespace-nowrap">{fmtDate(a.concluida_em)}</Td>
                          <Td>{a.nome || '—'}</Td>
                          <Td className="whitespace-nowrap">{a.cpf || '—'}</Td>
                          <Td>
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR[a.portal_status] || 'bg-slate-100'}`}>
                              {a.portal_status === 'OK' ? 'Subiu' : a.portal_status}
                            </span>
                          </Td>
                          <Td className="min-w-[240px] max-w-md text-xs text-slate-600">
                            {a.portal_status === 'OK'
                              ? `Enviada ${fmtDateTime(a.enviado_em)}${a.portal_obs ? ' · ' + a.portal_obs : ''}`
                              : a.portal_erro || a.portal_obs || '—'}
                          </Td>
                          <Td className="text-center">{a.tentativas || 0}</Td>
                          <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.atualizado_em)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
