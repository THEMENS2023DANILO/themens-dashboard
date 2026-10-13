import { useEffect, useState } from 'react'

// Avisa quando sai uma versão nova do dashboard enquanto a aba está aberta.
// (Abas abertas antes de um deploy ficam com o código antigo e podem dar erro ao gerar arquivos.)
// Compara o script principal da página aberta com o do index.html publicado agora.

function scriptAtual() {
  const s = document.querySelector('script[type="module"][src*="/assets/"]')
  return s ? new URL(s.getAttribute('src'), location.origin).pathname : null
}

async function scriptPublicado() {
  const r = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) return null
  const m = (await r.text()).match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)
  return m ? new URL(m[1], location.origin).pathname : null
}

export default function NovaVersao() {
  const [nova, setNova] = useState(false)

  useEffect(() => {
    const atual = scriptAtual()
    if (!atual) return undefined // ambiente de desenvolvimento
    let vivo = true
    const checar = async () => {
      try {
        const pub = await scriptPublicado()
        if (vivo && pub && pub !== atual) setNova(true)
      } catch { /* sem rede: tenta depois */ }
    }
    const t = setInterval(checar, 5 * 60 * 1000)
    const foco = () => { if (document.visibilityState === 'visible') checar() }
    document.addEventListener('visibilitychange', foco)
    checar()
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', foco) }
  }, [])

  if (!nova) return null
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
      <span><b>Saiu uma versão nova do dashboard.</b> Recarregue para usar a versão atual.</span>
      <button onClick={() => location.reload()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
        Recarregar agora
      </button>
    </div>
  )
}
