import { useEffect, useState } from 'react'
import { supabase, fmtDateTime } from '../supabase'

// Chargebacks do Pagar.me ligados aos pedidos Shopify GLP1 (RPC dash_chargebacks).
// tipo 'chargeback' = o próprio pedido teve chargeback
// tipo 'cpf_com_chargeback' = o CPF já teve chargeback em outra compra
export function useChargebacks(tick = 0) {
  const [mapa, setMapa] = useState(() => new Map())
  useEffect(() => {
    let vivo = true
    supabase.rpc('dash_chargebacks').then(({ data, error }) => {
      if (!vivo || error) return
      setMapa(new Map((data || []).map((c) => [String(c.shopify_order_id), c])))
    })
    return () => { vivo = false }
  }, [tick])
  return mapa
}

export function ChargebackBadge({ info }) {
  if (!info) return null
  if (info.tipo === 'chargeback') {
    return (
      <span
        title={`Chargeback em ${fmtDateTime(info.chargeback_em)}. Não enviar sem confirmar.`}
        className="ml-1 inline-block rounded bg-red-600 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-white"
      >
        Chargeback
      </span>
    )
  }
  return (
    <span
      title={`Este CPF já deu chargeback: ${info.pedidos_cb || ''}`}
      className="ml-1 inline-block rounded bg-orange-100 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-orange-800"
    >
      CPF já deu chargeback
    </span>
  )
}
