import { useState } from 'react'

const NUVEM_TOKEN    = 'fef52264247a7c6034c9d2afa2a0e2581c5430eb'
const NUVEM_STORE_ID = '5136296'
const TINY_TOKEN     = 'f10ce60f754299449d0d219f72b794aaa0a26019bba88e3ef4c57b87b416a636'

const LISTA_MED = new Set(['EBTOG','EBFOG','EBMOG','ESGOG','EBT2OG','EBT3OG','EBTCN','EBTCC','EBD30','EBD20'])
const TIPOS_ENVIOS = {
  'Correios - PAC':                        'PAC CONTRATO AG (03298)',
  'Correios - Sedex':                      'SEDEX CONTRATO AG (03220)',
  'PAC - SP':                              'SEDEX CONTRATO AG (03220)',
  'Correios - SEDEX':                      'SEDEX CONTRATO AG (03220)',
  'Frete Super Expresso em D+1 util (SP)': 'Frete Super Expresso em D+1 (SP)',
}
const BRAZIL_STATES = {
  'Acre':'AC','Alagoas':'AL','Amapá':'AP','Amapa':'AP','Amazonas':'AM','Bahia':'BA',
  'Ceará':'CE','Ceara':'CE','Distrito Federal':'DF','Espírito Santo':'ES','Espirito Santo':'ES',
  'Goiás':'GO','Goias':'GO','Maranhão':'MA','Maranhao':'MA','Mato Grosso':'MT',
  'Mato Grosso do Sul':'MS','Minas Gerais':'MG','Pará':'PA','Para':'PA','Paraíba':'PB',
  'Paraiba':'PB','Paraná':'PR','Parana':'PR','Pernambuco':'PE','Piauí':'PI','Piaui':'PI',
  'Rio de Janeiro':'RJ','Rio Grande do Norte':'RN','Rio Grande do Sul':'RS','Rondônia':'RO',
  'Rondonia':'RO','Roraima':'RR','Santa Catarina':'SC','São Paulo':'SP','Sao Paulo':'SP',
  'Sergipe':'SE','Tocantins':'TO',
}

function buildItems(products) {
  const EXCECAO_50 = '2x chocosono - durma melhor (2)'
  const norm = t => t.trim().toLowerCase().replace(/\s+/g,' ')
  return products.map(item => {
    const sku   = (item.sku || '').toUpperCase()
    const nome  = item.name || ''
    const price = parseFloat(item.price)
    const qty   = parseInt(item.quantity)
    const fator = norm(nome) === EXCECAO_50 ? 0.5 : 0.1
    return {
      codigo:         sku || '',
      descricao:      LISTA_MED.has(sku) ? sku : nome,
      unidade:        '',
      quantidade:     qty,
      valor_unitario: Math.round(price * fator * 100) / 100,
      _sku:           sku,
      _nome:          nome,
    }
  })
}

function buildPedidoJson(r) {
  const uf = BRAZIL_STATES[r.shipping_address.province] || 'SP'
  const forma_frete = TIPOS_ENVIOS[r.shipping_option] || 'SEDEX CONTRATO AG (03220)'
  const itens = buildItems(r.products)
  return JSON.stringify({
    pedido: {
      cliente: {
        nome:        r.contact_name,
        cpf_cnpj:    r.contact_identification,
        email:       r.contact_email,
        fone:        r.contact_phone,
        endereco:    r.shipping_address.address,
        numero:      r.shipping_address.number,
        complemento: r.shipping_address.floor,
        bairro:      r.shipping_address.locality,
        cep:         r.shipping_address.zipcode,
        cidade:      r.shipping_address.city,
        uf,
      },
      itens: itens.map(i => ({ item: { codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario } })),
      valor_frete:             r.shipping_cost_customer,
      valor_desconto:          0,
      formas_pagamento:        '',
      situacao:                r.payment_status,
      numero_pedido_loja:      r.id,
      forma_frete,
      forma_envio:             'C',
      numero_pedido_ecommerce: r.id,
    }
  }, null, 2)
}

export default function Validacao() {
  const [orderId, setOrderId]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [pedido, setPedido]     = useState(null)
  const [rawData, setRawData]   = useState(null)
  const [status, setStatus]     = useState(null)   // {type: 'ok'|'err'|'info', msg}
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)

  async function buscar() {
    if (!orderId.trim()) return
    setLoading(true)
    setPedido(null)
    setRawData(null)
    setStatus({ type: 'info', msg: 'Buscando pedido...' })
    setSent(false)
    try {
      const res = await fetch(
        `https://api.tiendanube.com/v1/${NUVEM_STORE_ID}/orders/${orderId.trim()}`,
        { headers: { 'Authentication': `bearer ${NUVEM_TOKEN}`, 'User-Agent': 'Dashboard TM (danilo@themens.com.br)' } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = await res.json()
      const itens = buildItems(r.products)
      setPedido({
        nome:        r.contact_name,
        cpf:         r.contact_identification,
        email:       r.contact_email,
        frete:       parseFloat(r.shipping_cost_customer).toFixed(2),
        forma_frete: TIPOS_ENVIOS[r.shipping_option] || 'SEDEX CONTRATO AG (03220)',
        itens,
      })
      setRawData(r)
      setStatus({ type: 'ok', msg: '✓ Pedido encontrado. Confira os dados abaixo.' })
    } catch (e) {
      setStatus({ type: 'err', msg: `❌ Erro: ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  async function enviar() {
    if (!rawData || sent) return
    setSending(true)
    setStatus({ type: 'info', msg: 'Enviando ao Tiny...' })
    try {
      const pedidoJson = buildPedidoJson(rawData)
      const body = new URLSearchParams()
      body.append('token', TINY_TOKEN)
      body.append('pedido', pedidoJson)
      body.append('formato', 'JSON')
      const res = await fetch('https://api.tiny.com.br/api2/pedido.incluir.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const data = await res.json()
      if (data.retorno.status !== 'OK') {
        const erro = JSON.stringify(data.retorno)
        throw new Error(erro)
      }
      setStatus({ type: 'ok', msg: '✓ Pedido enviado ao Tiny com sucesso!' })
      setSent(true)
    } catch (e) {
      setStatus({ type: 'err', msg: `❌ Erro Tiny: ${e.message}` })
    } finally {
      setSending(false)
    }
  }

  const statusColor = { ok: 'text-green-400', err: 'text-red-400', info: 'text-blue-400' }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Validação de Pedidos</h1>
        <p className="mt-1 text-sm text-slate-400">Busque o pedido, confira os dados e envie ao Tiny.</p>
      </div>

      {/* Busca */}
      <div className="rounded-xl bg-ink-900 p-6 space-y-4">
        <label className="block text-sm font-medium text-slate-300">ID do Pedido (Nuvemshop)</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Ex: 2058938986"
            className="flex-1 rounded-lg bg-ink-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-ink-700 focus:ring-brand-500"
          />
          <button
            onClick={buscar}
            disabled={loading}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        {status && <p className={`text-sm font-medium ${statusColor[status.type]}`}>{status.msg}</p>}
      </div>

      {/* Resultado */}
      {pedido && (
        <div className="rounded-xl bg-ink-900 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Nome</p>
              <p className="mt-1 font-medium text-white">{pedido.nome}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">CPF</p>
              <p className="mt-1 font-medium text-white">{pedido.cpf}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">E-mail</p>
              <p className="mt-1 font-medium text-white">{pedido.email}</p>
            </div>
          </div>

          <div className="border-t border-ink-800 pt-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-slate-500">Itens</p>
            <div className="space-y-2">
              {pedido.itens.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-ink-800 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">{item.descricao}</span>
                    {LISTA_MED.has(item._sku) && (
                      <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-semibold text-amber-300">MED</span>
                    )}
                  </div>
                  <span className="text-sm text-slate-400">{item.quantidade}x — R$ {item.valor_unitario.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-ink-800 pt-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Frete</p>
            <p className="mt-1 text-sm text-white">R$ {pedido.frete} — {pedido.forma_frete}</p>
          </div>

          <button
            onClick={enviar}
            disabled={sending || sent}
            className={`w-full rounded-xl py-3 text-base font-bold transition ${
              sent
                ? 'bg-green-700 text-white cursor-default'
                : 'bg-green-600 text-white hover:bg-green-500 disabled:opacity-50'
            }`}
          >
            {sent ? '✓ Enviado ao Tiny!' : sending ? 'Enviando...' : '✓ Confirmar e Enviar ao Tiny'}
          </button>
        </div>
      )}
    </div>
  )
}
