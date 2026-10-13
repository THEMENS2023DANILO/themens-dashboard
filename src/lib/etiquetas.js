// Etiquetas GLP1 em PDF (geradas no navegador com pdf-lib).
// - Rastreio: Zebra 100 x 70 mm, uma etiqueta por pedido.
// - Vial: modelos COSMO e VERBENNA, uma etiqueta por unidade (ou por pedido), tamanho configurável.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { semAcento } from './glp1'

const MM = 72 / 25.4
// fontes padrão do PDF só aceitam WinAnsi (latim básico + acentos)
const limpa = (s) => String(s ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim()
const cepFmt = (c) => { const d = String(c ?? '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (c ?? '') }

function baixar(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// quebra o texto em linhas que cabem na largura
function quebrar(texto, font, size, largura) {
  const palavras = limpa(texto).split(' ').filter(Boolean)
  const linhas = []
  let atual = ''
  for (const w of palavras) {
    const tenta = atual ? `${atual} ${w}` : w
    if (!atual || font.widthOfTextAtSize(tenta, size) <= largura) atual = tenta
    else { linhas.push(atual); atual = w }
  }
  if (atual) linhas.push(atual)
  return linhas.length ? linhas : ['']
}

// ---------------------------------------------------------------- rastreio
export async function gerarEtiquetasRastreio(pedidos, nomeArquivo) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 100 * MM
  const H = 70 * MM
  const m = 3.5 * MM
  const larg = W - 2 * m
  const preto = rgb(0, 0, 0)
  const cinza = rgb(0.35, 0.35, 0.35)

  for (const p of pedidos) {
    const pg = doc.addPage([W, H])
    let y = H - m

    // nº do pedido (canto superior direito)
    const ped = limpa(p.pedido)
    pg.drawText(ped, { x: W - m - font.widthOfTextAtSize(ped, 7), y: y - 7, size: 7, font, color: cinza })

    // NOME COMPLETO
    let tam = 12
    let linhasNome = quebrar((p.nome || '').toUpperCase(), fb, tam, larg - 40)
    while (linhasNome.length > 2 && tam > 8) { tam -= 0.5; linhasNome = quebrar((p.nome || '').toUpperCase(), fb, tam, larg - 40) }
    for (const l of linhasNome.slice(0, 2)) { y -= tam; pg.drawText(l, { x: m, y, size: tam, font: fb, color: preto }); y -= 2 }

    // ENDEREÇO COMPLETO
    const end = [
      `${p.end_rua || ''}, ${p.end_numero || 'S/N'}${p.end_complemento ? ` - ${p.end_complemento}` : ''}`,
      p.end_bairro || '',
      `${p.cidade || ''}/${p.uf || ''}  -  CEP ${cepFmt(p.cep)}`,
    ].filter((s) => limpa(s))
    let tEnd = 9
    let linhasEnd = end.flatMap((l) => quebrar(l, font, tEnd, larg))
    while (linhasEnd.length > 4 && tEnd > 7) { tEnd -= 0.5; linhasEnd = end.flatMap((l) => quebrar(l, font, tEnd, larg)) }
    y -= 2
    for (const l of linhasEnd.slice(0, 4)) { y -= tEnd; pg.drawText(l, { x: m, y, size: tEnd, font, color: preto }); y -= 1.5 }

    // campos para preencher na entrega (ocupam a parte de baixo)
    const campos = ['CPF:', 'Data de recebimento:', 'Nome legível:', 'Assinatura:']
    const passo = 9.5 * MM
    let yc = m + 2
    for (const c of [...campos].reverse()) {
      const w = fb.widthOfTextAtSize(c, 9)
      pg.drawText(c, { x: m, y: yc, size: 9, font: fb, color: preto })
      if (c === 'Data de recebimento:') {
        pg.drawText('____ / ____ / ________', { x: m + w + 6, y: yc, size: 9, font, color: preto })
      } else {
        pg.drawLine({ start: { x: m + w + 4, y: yc - 1 }, end: { x: W - m, y: yc - 1 }, thickness: 0.7, color: preto })
      }
      yc += passo
    }
  }
  baixar(await doc.save(), nomeArquivo)
}

// ---------------------------------------------------------------- vial
export const MODELOS_VIAL = {
  COSMO: {
    nome: 'COSMO (Cosmopharma)',
    largura: 30,
    altura: 80,
    texto: [
      '00.524.133.0004 - 00',
      'F. Resp: Angelica Barth',
      'CRFSP 101548     LT: {LOTE}',
      'Val {VALIDADE}       QSP {QSP}',
      '{PACIENTE}',
      'USO SUBCUTANEO E POSOLOGIA',
      'CONFORME INDICACAO MEDICA',
    ].join('\n'),
    padrao: { QSP: '2.4ML' },
  },
  VERBENNA: {
    nome: 'VERBENNA',
    largura: 30,
    altura: 80,
    texto: [
      '07.787.540.000167 CRFSP57841',
      'F. Resp: Lincoln Martins',
      'REG: {REG}   Fab.{FABRICACAO}',
      'LT{LOTE}  Val{VALIDADE}',
      'R.Prof. Seratim Orlandi, 346',
      'Verbenna Farm. Manip Ltda',
      '{PACIENTE}',
      '{MEDICO}',
      'USO SUBCUTANEO E POSOLOGIA',
      'CONFORME INDICACAO MEDICA',
    ].join('\n'),
    padrao: {},
  },
}

// campos preenchidos automaticamente a partir do pedido
export const CAMPOS_AUTO = ['PACIENTE', 'MEDICO', 'PEDIDO', 'PRODUTO', 'DOSAGEM']
export const ROTULO_CAMPO = { LOTE: 'Lote', VALIDADE: 'Validade', FABRICACAO: 'Fabricação', REG: 'REG', QSP: 'QSP' }

export function camposDoTexto(texto) {
  return [...new Set([...texto.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]))]
}

const tiraTitulo = (n) => String(n || '').trim().replace(/^(dr|dra|dr\(a\))\.?\s+/i, '')
export function textoMedico(p) {
  if (!p.medico_nome) return ''
  return `DR(A) ${tiraTitulo(p.medico_nome)}${p.medico_crm ? ` ${p.medico_crm}` : ''}`
}

// monta as linhas de uma etiqueta (sem acentos, como no NiceLabel)
export function linhasVial(texto, p, valores) {
  const auto = {
    PACIENTE: (p.nome || '').toUpperCase(),
    MEDICO: textoMedico(p).toUpperCase(),
    PEDIDO: p.pedido || '',
    PRODUTO: p.produto || '',
    DOSAGEM: p.dosagem || '',
  }
  return texto.split('\n')
    .map((l) => ({
      variavel: /\{(PACIENTE|MEDICO)\}/.test(l),
      txt: semAcento(l.replace(/\{([A-Z_]+)\}/g, (_, k) => (k in auto ? auto[k] : (valores[k] ?? '')))).trim(),
    }))
    .filter((l, i, arr) => l.txt || !arr[i].variavel) // linha de médico vazia some
}

export async function gerarEtiquetasVial(itens, modelo, nomeArquivo) {
  // itens: [{ pedido (objeto), linhas }]
  const doc = await PDFDocument.create()
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = modelo.largura * MM
  const H = modelo.altura * MM
  const m = Math.max(1.2 * MM, W * 0.03)
  const larg = W - 2 * m

  for (const { linhas } of itens) {
    const pg = doc.addPage([W, H])
    // tamanho da fonte: a maior linha fixa ocupa a largura toda (como no modelo)
    const fixas = linhas.filter((l) => !l.variavel).map((l) => l.txt)
    const maior = Math.max(...(fixas.length ? fixas : linhas.map((l) => l.txt)).map((t) => fb.widthOfTextAtSize(t, 1)), 1)
    const tam = Math.min(14, larg / maior)
    const alt = tam * 1.18
    let y = H - m
    for (const l of linhas) {
      const partes = l.variavel ? quebrar(l.txt, fb, tam, larg) : [l.txt]
      for (const t of partes) {
        y -= alt
        if (y < m) break
        pg.drawText(t, { x: m, y: y + (alt - tam) / 2, size: tam, font: fb, color: rgb(0, 0, 0) })
      }
    }
  }
  baixar(await doc.save(), nomeArquivo)
}
