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

  return (
    <Layout email={session.user.email}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/consultas" element={<Consultas />} />
        <Route path="/rastreios" element={<Rastreios />} />
        <Route path="/status-pedidos" element={<StatusPedidos />} />
        <Route path="/frete-expresso" element={<FreteExpresso />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
