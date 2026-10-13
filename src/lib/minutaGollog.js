// Preenche a "Minuta de Despacho Eletrônica" oficial da Gollog (public/minuta-gollog.pdf).
// Dados fixos (remetente The Mens, serviço, peso, embalagem...) vêm de glp1_config.gollog.
// Variáveis por pedido: dados do cliente, NF emitida no Notazz e aeroporto de destino.

import * as pdfLib from 'pdf-lib'

const P = 'formulário1[0].#subform[0].'

const dig = (s) => String(s ?? '').replace(/\D/g, '')
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cpfFmt = (c) => { const d = dig(c); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c ?? '') }
const cepFmt = (c) => { const d = dig(c); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (c ?? '') }
const foneFmt = (t) => {
  let d = dig(t)
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t ?? ''
}
// fonte padrão do PDF só aceita WinAnsi
const limpa = (s) => String(s ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '')

let cacheTemplate = null
async function template() {
  if (!cacheTemplate) cacheTemplate = await fetch('/minuta-gollog.pdf').then((r) => r.arrayBuffer())
  return cacheTemplate
}

async function umaMinuta(lib, p, cfg, valorNfPadrao) {
  const { PDFDocument, StandardFonts, rgb } = lib
  const doc = await PDFDocument.load(await template())
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)

  const T = (campo, valor) => {
    const f = form.getTextField(P + campo)
    const txt = limpa(valor)
    const r = f.acroField.getWidgets()[0].getRectangle()
    const larg = font.widthOfTextAtSize(txt || ' ', 1)
    f.setFontSize(Math.max(5, Math.min(9, (r.width - 6) / larg)))
    f.setText(txt)
  }
  const D = (campo, valor) => { try { if (valor) form.getDropdown(P + campo).select(valor) } catch { /* opção inexistente */ } }

  const r = cfg.remetente || {}
  const tom = cfg.tomador || {}
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const valorMerc = p.nf_valor ? Number(p.nf_valor) : valorNfPadrao

  T('CampoTexto4[1]', cfg.servico)
  D('ListaSuspensa1[0]', cfg.forma_pagamento)
  D('ListaSuspensa1[1]', cfg.tipo_entrega)
  T('CampoTexto1[0]', p.aeroporto_iata || '')

  // remetente (fixo)            // destinatário (cliente)
  T('CampoTexto2[1]', r.nome); T('CampoTexto2[2]', p.nome)
  T('CampoTexto2[3]', r.cnpj); T('CampoTexto2[4]', cpfFmt(p.cpf))
  T('CampoTexto2[5]', r.endereco); T('CampoTexto2[6]', `${p.end_rua || ''}, ${p.end_numero || 'S/N'}`)
  T('CampoTexto2[7]', r.complemento); T('CampoTexto2[18]', p.end_complemento || '')
  T('CampoTexto2[8]', r.fone); T('CampoTexto2[17]', foneFmt(p.telefone))
  T('CampoTexto2[9]', r.bairro); T('CampoTexto2[16]', p.end_bairro || '')
  T('CampoTexto2[12]', r.uf); T('CampoTexto2[15]', p.uf)
  T('CampoTexto2[11]', r.cep); T('CampoTexto2[14]', cepFmt(p.cep))
  T('CampoTexto2[10]', r.cidade); T('CampoTexto2[13]', p.cidade)
  T('e_mail[0]', r.email); T('e_mail[1]', p.email || '')

  T('CampoTexto2[19]', tom.nome); T('CampoTexto2[20]', tom.cnpj); T('CampoTexto2[21]', tom.conta_gollog)

  T('CampoNumérico1[0]', cfg.volumes); T('CampoNumérico1[1]', cfg.peso_total)
  T('CampoTexto2[23]', cfg.medidas)
  T('CampoTexto2[22]', cfg.produto_predominante)
  T('CampoTexto4[0]', cfg.artigo_perigoso_un)
  D('ListaSuspensa1[2]', cfg.tipo_embalagem); D('ListaSuspensa1[3]', cfg.tipo_embalagem)

  T('CampoTexto2[0]', p.nf_numero ? `NF ${p.nf_numero}${p.nf_chave ? `  -  Chave ${p.nf_chave}` : ''}` : '')
  T('CampoTexto2[24]', cfg.seguro === 'proprio' ? cfg.apolice : '')
  T('CampoTexto2[25]', cfg.seguro === 'proprio' ? cfg.seguradora : '')
  T('CampoTexto2[26]', cfg.seguro !== 'sem' && valorMerc != null && !isNaN(valorMerc) ? brl(valorMerc) : '')
  T('CampoTexto2[27]', `${cfg.local || 'São Paulo'}, ${hoje}`)
  T('CampoTexto2[28]', cfg.responsavel)
  for (const c of ['CampoTexto2[29]', 'CampoTexto2[30]', 'CampoTexto2[31]', 'CampoTexto2[32]']) T(c, '') // uso da GOL

  form.updateFieldAppearances(font)
  form.flatten()

  // tipo de seguro (rádio) e autorização (caixa)
  const pg = doc.getPage(0)
  const cinza = rgb(0.3, 0.3, 0.3)
  const marcado = { proprio: 0, gol: 1, sem: 2 }[cfg.seguro] ?? 1
  ;[[102, 216], [102, 188], [102, 166]].forEach(([x, y], i) => {
    pg.drawCircle({ x: x + 5, y: y + 5, size: 4.5, borderColor: cinza, borderWidth: 0.8 })
    if (i === marcado) pg.drawCircle({ x: x + 5, y: y + 5, size: 2.5, color: rgb(0, 0, 0) })
  })
  pg.drawRectangle({ x: 93, y: 148, width: 10, height: 10, borderColor: cinza, borderWidth: 0.8 })
  pg.drawText('X', { x: 95.2, y: 149.6, size: 9, font: fb })
  pg.drawText(limpa(`Pedido ${p.pedido}${p.minuta_num ? ` - minuta ${p.minuta_num}` : ''}`), { x: 440, y: 20, size: 7, font, color: cinza })
  return doc
}

// Gera um PDF único com uma página por pedido e abre/baixa no navegador.
export async function gerarMinutasPdf(pedidos, cfgGollog, valorNfPadrao, nomeArquivo) {
  const lib = pdfLib
  const saida = await lib.PDFDocument.create()
  for (const p of pedidos) {
    const doc = await umaMinuta(lib, p, cfgGollog || {}, valorNfPadrao)
    const [pg] = await saida.copyPages(doc, [0])
    saida.addPage(pg)
  }
  const bytes = await saida.save()
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
