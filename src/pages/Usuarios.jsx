import { useEffect, useState } from 'react'
import { supabase, fmtDateTime } from '../supabase'
import { Section, Spinner, Th, Td } from '../components/ui'

// Usuários do dashboard (só a conta master vê). Funções: dash_usuarios / dash_usuario_acao.

export default function Usuarios() {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    supabase.rpc('dash_usuarios').then(({ data, error }) => {
      if (error) { setErro(error.message); return }
      setErro('')
      setLista(data || [])
    })
  }, [tick])

  async function acao(u, tipo) {
    const textos = {
      resetar_mfa: `Resetar o MFA de ${u.email}? No próximo login a pessoa cadastra o app de novo.`,
      bloquear: `Bloquear ${u.email}? A pessoa é desconectada e não consegue mais entrar.`,
      desbloquear: `Desbloquear ${u.email}?`,
    }
    if (!window.confirm(textos[tipo])) return
    setOcupado(u.id + tipo)
    const { error } = await supabase.rpc('dash_usuario_acao', { p_user: u.id, p_acao: tipo })
    setOcupado(null)
    if (error) { setErro(error.message); return }
    setTick((n) => n + 1)
  }

  const btn = 'rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Usuários</h1>
        <div className="text-xs text-slate-400">Acesso ao dashboard · todo login exige o código do app autenticador (MFA)</div>
      </div>

      {erro && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Erro: {erro}</div>}

      {!lista ? (!erro && <Spinner />) : (
        <Section title={`${lista.length} usuários · ${lista.filter((u) => u.mfa).length} com MFA ativo`}>
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr><Th>Nome</Th><Th>E-mail</Th><Th>MFA</Th><Th>Situação</Th><Th>Último login</Th><Th>Ações</Th></tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>{u.nome || '—'}{u.master && <span className="ml-2 rounded-full bg-ink-900 px-2 py-0.5 text-xs text-white">master</span>}</Td>
                    <Td className="text-xs">{u.email}</Td>
                    <Td>
                      {u.mfa
                        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Ativo</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Cadastra no próximo login</span>}
                    </Td>
                    <Td>
                      {u.bloqueado
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Liberado</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{u.ultimo_login ? fmtDateTime(u.ultimo_login) : 'nunca entrou'}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => acao(u, 'resetar_mfa')}
                          disabled={!u.mfa || !!ocupado}
                          className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}
                        >
                          Resetar MFA
                        </button>
                        {!u.master && (u.bloqueado ? (
                          <button onClick={() => acao(u, 'desbloquear')} disabled={!!ocupado} className={`${btn} bg-emerald-100 text-emerald-700 hover:bg-emerald-200`}>
                            Desbloquear
                          </button>
                        ) : (
                          <button onClick={() => acao(u, 'bloquear')} disabled={!!ocupado} className={`${btn} bg-red-100 text-red-700 hover:bg-red-200`}>
                            Bloquear
                          </button>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Para criar um novo login, peça ao Claude (e-mail + senha gerada) ou crie em Supabase → Authentication → Users.
          </p>
        </Section>
      )}
    </div>
  )
}
