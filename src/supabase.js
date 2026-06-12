import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://lgclfomlufbelgmjfxix.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Hodb2cY3u32Pa7a9DVEYfg_ObWE3trR'

export const supabase = createClient(url, key)

const TZ = '-03:00'

// Converte uma data 'YYYY-MM-DD' em limites [início, fim) no fuso de São Paulo
export function dayBounds(fromDate, toDate) {
  const start = `${fromDate}T00:00:00${TZ}`
  const end = new Date(`${toDate}T00:00:00${TZ}`)
  end.setDate(end.getDate() + 1)
  return { start, end: end.toISOString() }
}

export function todaySP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function fmtBRL(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
