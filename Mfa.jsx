import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Verificação em duas etapas (MFA por app autenticador: Google Authenticator, Microsoft Authenticator, Authy…).
// Todo login precisa do código de 6 dígitos. No primeiro acesso a pessoa cadastra o app lendo o QR code.

function Caixa({ titulo, sub, children, email }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-ink-900">The Mens</div>
          <div className="mt-1 text-sm font-semibold text-ink-900">{titulo}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        {children}
        <div className="mt-6 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
          {email} ·{' '}
          <button onClick={() => supabase.auth.signOut()} className="underline hover:text-slate-600">
            sair
          </button>
        </div>
      </div>
    </div>
  )
}

function CampoCodigo({ onConfirmar, carregando, erro }) {
  const [codigo, setCodigo] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (codigo.length === 6) onConfirmar(codigo) }}
    >
      <label className="mb-1 block text-sm font-medium">Código de 6 dígitos do app</label>
      <input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] focus:border-brand-500 focus:outline-none"
        placeholder="••••••"
      />
      {erro && <div className="mb-4 text-sm text-red-600">{erro}</div>}
      <button
        disabled={carregando || codigo.length !== 6}
        className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {carregando ? 'Verificando…' : 'Confirmar'}
      </button>
    </form>
  )
}

export default function MfaGate({ session, children }) {
  const [estado, setEstado] = useState('carregando') // carregando | ok | verificar | cadastrar
  const [fator, setFator] = useState(null) // { id, qr, secret }
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const email = session?.user?.email

  const checar = useCallback(async () => {
    setErro('')
    const { data: aal, error: e1 } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (e1) { setErro(e1.message); setEstado('verificar'); return }
    if (aal.currentLevel === 'aal2') { setEstado('ok'); return }

    const { data: fs } = await supabase.auth.mfa.listFactors()
    const verificados = (fs?.totp || []).filter((f) => f.status === 'verified')
    if (verificados.length) {
      setFator({ id: verificados[0].id })
      setEstado('verificar')
      return
    }
    // primeiro acesso: remove cadastros pela metade e gera um novo QR code
    for (const f of fs?.all || []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data: novo, error: e2 } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Dashboard ${new Date().toISOString().slice(0, 10)}`,
      issuer: 'The Mens Dashboard',
    })
    if (e2) { setErro(e2.message); setEstado('cadastrar'); return }
    setFator({ id: novo.id, qr: novo.totp.qr_code, secret: novo.totp.secret })
    setEstado('cadastrar')
  }, [])

  useEffect(() => { checar() }, [checar, session?.user?.id])

  async function confirmar(codigo) {
    setCarregando(true)
    setErro('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo })
    setCarregando(false)
    if (error) { setErro('Código inválido ou expirado. Tente o código atual do app.'); return }
    setEstado('ok')
  }

  if (estado === 'ok') return children
  if (estado === 'carregando') {
    return <div className="flex h-screen items-center justify-center text-slate-400">Carregando…</div>
  }

  if (estado === 'cadastrar') {
    return (
      <Caixa email={email} titulo="Ative a verificação em duas etapas" sub="Obrigatório para acessar o dashboard">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Instale o <b>Google Authenticator</b> (ou Microsoft Authenticator) no celular.</li>
          <li>No app, toque em <b>+</b> e escolha <b>Ler código QR</b>.</li>
          <li>Digite abaixo o código de 6 dígitos que aparecer.</li>
        </ol>
        {fator?.qr ? (
          <div className="mb-3 flex justify-center">
            <img src={fator.qr} alt="QR code para o app autenticador" className="h-48 w-48" />
          </div>
        ) : (
          <div className="mb-3 text-center text-sm text-slate-400">Gerando QR code…</div>
        )}
        {fator?.secret && (
          <div className="mb-4 text-center text-xs text-slate-500">
            Sem câmera? Digite a chave no app:
            <div className="mt-1 select-all break-all font-mono text-slate-700">{fator.secret}</div>
          </div>
        )}
        <CampoCodigo onConfirmar={confirmar} carregando={carregando} erro={erro} />
      </Caixa>
    )
  }

  return (
    <Caixa email={email} titulo="Verificação em duas etapas" sub="Abra o app autenticador e digite o código">
      <CampoCodigo onConfirmar={confirmar} carregando={carregando} erro={erro} />
      <div className="mt-3 text-center text-xs text-slate-400">Perdeu o celular? Fale com o Danilo para resetar o seu MFA.</div>
    </Caixa>
  )
}
