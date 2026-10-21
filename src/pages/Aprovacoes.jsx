import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtBRL, fmtDateTime, todaySP } from '../supabase'
import { Card, Section, Spinner, Th, Td, BarList } from '../components/ui'
import { fmtCpf, semAcento } from '../lib/glp1'

// Aprovações: tentativas de pagamento no Pagar.me (tabela pagarme_charges, sincronizada de hora em hora).
// "Por cliente" conta cada cliente (CPF; sem CPF, e-mail) uma vez só no período:
// aprovado se pelo menos uma tentativa dele foi aprovada.

const PERIODOS = [
  { v: 'hoje', label: 'Hoje', dias: 0 },
  { v: '7', label: '7 dias', dias: 6 },
  { v: '30', label: '30 dias', dias: 29 },
  { v: '60', label: '60 dias', dias: 59 },
  { v: 'custom', label: 'Personalizado' },
]
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const menosDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1).replace('.', ',')}%` : '—')

const COR_MOTIVO = (m) =>
  m === 'Aprovada' ? 'bg-emerald-100 text-emerald-700'
    : m === 'Antifraude bloqueou' ? 'bg-red-100 text-red-700'
    : /fraude|bloqueado|definitiva/i.test(m) ? 'bg-orange-100 text-orange-800'
    : m === 'Pendente' ? 'bg-slate-100 text-slate-600'
    : 'bg-amber-100 text-amber-800'

export default function Aprovacoes() {
  const hoje = todaySP()
  const [periodo, setPeriodo] = useState('30')
  const [ini, setIni] = useState(menosDias(hoje, 29))
  const [fim, setFim] = useState(hoje)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const [motivo, setMotivo] = useState('')

  function escolhePeriodo(v) {
    setPeriodo(v)
    const p = PERIODOS.find((x) => x.v === v)
    if (p && p.dias != null) { setIni(menosDias(hoje, p.dias)); setFim(hoje) }
  }

  useEffect(() => {
    if (!ini || !fim || ini > fim) return undefined
    let vivo = true
    setCarregando(true)
    supabase.rpc('dash_aprovacoes', { p_ini: ini, p_fim: fim, p_metodo: 'credit_card' }).then(({ data, error }) => {
      if (!vivo) return
      setCarregando(false)
      if (error) { setErro(error.message); return }
      setErro('')
      setDados(data)
    })
    return () => { vivo = false }
  }, [ini, fim])

  const lista = useMemo(() => {
    if (!dados) return []
    const s = semAcento(busca.trim().toLowerCase())
    const sd = busca.replace(/\D/g, '')
    return dados.lista.filter((t) => {
      if (motivo && t.motivo !== motivo) return false
      if (!s) return true
      return semAcento(`${t.nome || ''} ${t.cartao_nome || ''} ${t.email || ''}`).toLowerCase().includes(s) ||
        (sd && ((t.cpf || '').includes(sd) || (t.pedido || '').replace(/\D/g, '') === sd))
    })
  }, [dados, busca, motivo])

  const r = dados?.resumo
  const motivosLista = dados?.motivos || []
  const pill = (ativo) => `rounded-full px-3 py-1 text-xs font-medium ${ativo ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Aprovações</h1>
        <div className="text-xs text-slate-400">Tentativas de pagamento com cartão no Pagar.me · atualizado de hora em hora</div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <button key={p.v} onClick={() => escolhePeriodo(p.v)} className={pill(periodo === p.v)}>{p.label}</button>
          ))}
        </div>
        {periodo === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={ini} max={fim} onChange={(e) => setIni(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
            <span className="text-slate-400">até</span>
            <input type="date" value={fim} min={ini} max={hoje} onChange={(e) => setFim(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
          </div>
        )}
      </div>

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro ao carregar: {erro}</div>}

      {!dados ? <Spinner /> : (
        <div className={`space-y-6 ${carregando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Card title="Tentativas" value={r.tentativas} />
            <Card title="Aprovadas" value={r.aprovadas} sub={fmtBRL(r.valor_aprovado)} />
            <Card title="Aprovação total" value={pct(r.aprovadas, r.tentativas)} sub="aprovadas ÷ tentativas" accent="text-brand-600" />
            <Card title="Clientes que tentaram" value={r.clientes} sub="cada CPF conta 1 vez" />
            <Card title="Aprovação por cliente" value={pct(r.clientes_aprovados, r.clientes)} sub={`${r.clientes_aprovados} conseguiram pagar`} accent="text-emerald-600" />
            <Card title="Chargebacks" value={r.chargebacks} sub="das tentativas do período" accent={r.chargebacks ? 'text-red-600' : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Por que não aprovou">
              <BarList items={motivosLista.map((m) => ({ label: m.motivo, value: m.qtd }))} />
            </Section>
            <Section title="Meses anteriores">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr><Th>Mês</Th><Th>Tentativas</Th><Th>Aprovadas</Th><Th>Aprovação total</Th><Th>Clientes</Th><Th>Aprovação por cliente</Th></tr>
                  </thead>
                  <tbody>
                    {(dados.meses || []).map((m) => {
                      const [a, mm] = m.mes.split('-')
                      const atual = m.mes === fim.slice(0, 7)
                      return (
                        <tr key={m.mes}>
                          <Td className="whitespace-nowrap font-medium">{MESES[Number(mm) - 1]}/{a}{atual && <span className="ml-1 text-xs text-slate-400">(até {fim.split('-').reverse().slice(0, 2).join('/')})</span>}</Td>
                          <Td>{m.tentativas}</Td>
                          <Td>{m.aprovadas}</Td>
                          <Td className="font-semibold">{pct(m.aprovadas, m.tentativas)}</Td>
                          <Td>{m.clientes}</Td>
                          <Td className="font-semibold text-emerald-700">{pct(m.clientes_aprovados, m.clientes)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section
            title={`Tentativas (${lista.length}${dados.lista.length >= 3000 ? ', mostrando as 3.000 mais recentes' : ''})`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                  <option value="">Todos os resultados</option>
                  <option value="Aprovada">Aprovada</option>
                  {motivosLista.map((m) => <option key={m.motivo} value={m.motivo}>{m.motivo}</option>)}
                </select>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF ou pedido" className="w-52 rounded-lg border border-slate-300 px-3 py-1 text-sm" />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th>Data</Th><Th>Nome</Th><Th>CPF</Th><Th>Pedido</Th><Th>Valor</Th><Th>Cartão</Th>
                    <Th>Antifraude</Th><Th>Código</Th><Th>Resultado</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t) => (
                    <tr key={t.id} className="align-top hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(t.criado_em)}</Td>
                      <Td className="whitespace-nowrap">
                        {t.nome || '—'}
                        {t.cartao_nome && semAcento(t.cartao_nome).toUpperCase() !== semAcento(t.nome || '').toUpperCase() && (
                          <div className="text-xs text-slate-400">cartão: {t.cartao_nome}</div>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{t.cpf ? fmtCpf(t.cpf) : '—'}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{t.pedido || '—'}</Td>
                      <Td className="whitespace-nowrap">
                        {fmtBRL(t.valor)}
                        {t.parcelas > 1 && <div className="text-xs text-slate-400">{t.parcelas}x</div>}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {[t.bandeira, t.cartao_final && `•••• ${t.cartao_final}`].filter(Boolean).join(' · ') || '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {t.antifraude === 'approved' ? <span className="text-emerald-700">aprovou</span>
                          : t.antifraude === 'reproved' ? <span className="font-semibold text-red-600">reprovou</span>
                          : <span className="text-slate-400">—</span>}
                        {t.score && <div className="text-slate-400">score {t.score}</div>}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{t.codigo || '—'}</Td>
                      <Td className="min-w-[220px]">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_MOTIVO(t.motivo)}`}>{t.motivo}</span>
                        {t.status === 'chargedback' && <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Chargeback</span>}
                        {t.mensagem && !['Aprovada', 'Antifraude bloqueou'].includes(t.motivo) && <div className="mt-0.5 text-xs text-slate-400">{t.mensagem}</div>}
                      </Td>
                    </tr>
                  ))}
                  {!lista.length && <tr><td colSpan={9} className="py-10 text-center text-sm text-slate-400">Nenhuma tentativa nesse filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
