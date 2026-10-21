import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Pedidos from './pages/Pedidos'
import Consultas from './pages/Consultas'
import Rastreios from './pages/Rastreios'
import StatusPedidos from './pages/StatusPedidos'
import FreteExpresso from './pages/FreteExpresso'
import Cliente from './pages/Cliente'
import Validacao from './pages/Validacao'
import Avaliacoes from './pages/Avaliacoes'
import Glp1 from './pages/Glp1'
import Glp1Fiscal from './pages/Glp1Fiscal'
import Glp1Gollog from './pages/Glp1Gollog'
import Glp1Etiquetas from './pages/Glp1Etiquetas'
import CheckCpf from './pages/CheckCpf'
import Aprovacoes from './pages/Aprovacoes'
import Dre from './pages/Dre'
import MfaGate from './pages/Mfa'
import Usuarios from './pages/Usuarios'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Carregando…</div>
  }
  if (!session) return <Login />
  const papel = session.user.app_metadata?.papel || ''

  return (
    <MfaGate session={session}>
    <Layout email={session.user.email} master={papel === 'master'} papel={papel}>
      {papel === 'glp1' ? (
        // Acesso só às abas GLP1 (o banco também bloqueia o resto para este papel)
        <Routes>
          <Route path="/glp1" element={<Glp1 />} />
          <Route path="/glp1-fiscal" element={<Glp1Fiscal />} />
          <Route path="/glp1-gollog" element={<Glp1Gollog />} />
          <Route path="/glp1-etiquetas" element={<Glp1Etiquetas />} />
          <Route path="*" element={<Navigate to="/glp1" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/consultas" element={<Consultas />} />
          <Route path="/rastreios" element={<Rastreios />} />
          <Route path="/status-pedidos" element={<StatusPedidos />} />
          <Route path="/cliente" element={<Cliente />} />
          <Route path="/frete-expresso" element={<FreteExpresso />} />
          <Route path="/validacao" element={<Validacao />} />
          <Route path="/avaliacoes" element={<Avaliacoes />} />
          <Route path="/glp1" element={<Glp1 />} />
          <Route path="/glp1-fiscal" element={<Glp1Fiscal />} />
          <Route path="/glp1-gollog" element={<Glp1Gollog />} />
          <Route path="/glp1-etiquetas" element={<Glp1Etiquetas />} />
          <Route path="/check-cpf" element={<CheckCpf />} />
          <Route path="/aprovacoes" element={<Aprovacoes />} />
          {papel === 'master' && <Route path="/dre" element={<Dre />} />}
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
    </MfaGate>
  )
}
