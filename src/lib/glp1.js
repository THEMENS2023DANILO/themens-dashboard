// Regras compartilhadas das abas GLP1.

// Status operacional do pedido (tabela glp1_status_pedido). "Cancelado" e "Aguardando Pagamento" vêm do Shopify.
export const STATUS = [
  { v: 'Sem status', cor: 'bg-slate-100 text-slate-500' },
  { v: 'Aguardando Comprovante', cor: 'bg-amber-100 text-amber-800' },
  { v: 'Pendente Comprovante', cor: 'bg-amber-100 text-amber-800' },
  { v: 'Pendente Farmácia', cor: 'bg-orange-100 text-orange-800' },
  { v: 'Em Produção', cor: 'bg-blue-100 text-blue-700' },
  { v: 'Disponível Para Entrega', cor: 'bg-cyan-100 text-cyan-800' },
  { v: 'Aguard. Resposta de Retirada', cor: 'bg-violet-100 text-violet-700' },
  { v: 'Em Processo de Retirada', cor: 'bg-violet-100 text-violet-700' },
  { v: 'Em Rota (SEM RASTREIO)', cor: 'bg-indigo-100 text-indigo-700' },
  { v: 'Em Rota (COM RASTREIO)', cor: 'bg-indigo-100 text-indigo-700' },
  { v: 'Concluído', cor: 'bg-emerald-100 text-emerald-700' },
]

export const COR_STATUS = Object.fromEntries([
  ...STATUS.map((s) => [s.v, s.cor]),
  ['Cancelado', 'bg-red-100 text-red-700'],
  ['Aguardando Pagamento', 'bg-amber-50 text-amber-700'],
])

export const PRODUTOS = [
  { v: '', label: 'Todos' },
  { v: 'Semaglutida', label: 'Semaglutida' },
  { v: 'Tirzepatida', label: 'Tirzepatida' },
]

export const ROTAS = [
  { v: '', label: 'Todas' },
  { v: 'DEDICADO', label: 'Dedicado' },
  { v: 'GOLLOG', label: 'Gollog' },
  { v: 'MOOVWAY/VERIFICAR', label: 'Moovway / Verificar' },
]

export const emRota = (s) => (s || '').startsWith('Em Rota')

// Pago no Shopify e não cancelado (reembolso parcial conta como pago)
export const ehPago = (p) =>
  !p.cancelled_at && (p.financial_status === 'paid' || p.financial_status === 'partially_refunded')

export function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || '—'
}

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Busca por nome, cidade, CPF ou número do pedido
export function bateBusca(p, busca) {
  const s = busca.trim().toLowerCase()
  if (!s) return true
  const sd = s.replace(/\D/g, '')
  return (
    semAcento(p.nome || '').toLowerCase().includes(semAcento(s)) ||
    semAcento(p.cidade || '').toLowerCase().includes(semAcento(s)) ||
    (sd && ((p.cpf || '').includes(sd) || (p.pedido || '').replace(/\D/g, '') === sd))
  )
}
