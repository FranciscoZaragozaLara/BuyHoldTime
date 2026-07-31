'use client';

import React, { useEffect, useState } from 'react';
import { useAuth, UserRole } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';
import { ShieldCheck, Users, BarChart2, Clock, RefreshCw, CheckCircle, ShieldAlert } from 'lucide-react';

interface TickerData {
  id: string;
  symbol: string;
  name: string;
  price: number;
  buyHoldIndex: number;
  recommendation: string;
  updatedAt: string;
}

interface UserData {
  id: string;
  firebaseUid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPage() {
  const { user, role, token, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'tickers' | 'users'>('tickers');

  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserRole, setUpdatingUserRole] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchData = async () => {
    if (!token || role !== 'ADMIN') return;
    setLoading(true);
    setError(null);

    try {
      const [tickersRes, usersRes] = await Promise.all([
        fetch(`${apiBase}/admin/tickers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBase}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!tickersRes.ok) {
        const errData = await tickersRes.json().catch(() => null);
        throw new Error(errData?.message || `Error al obtener tickers (Status: ${tickersRes.status})`);
      }
      if (!usersRes.ok) {
        const errData = await usersRes.json().catch(() => null);
        throw new Error(errData?.message || `Error al obtener usuarios (Status: ${usersRes.status})`);
      }

      const tickersData = await tickersRes.json();
      const usersData = await usersRes.json();

      setTickers(tickersData.tickers || []);
      setUsers(usersData.users || []);
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!authLoading && role === 'ADMIN' && token) {
      fetchData();
    }
  }, [authLoading, role, token]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!token) return;
    setUpdatingUserRole(userId);
    try {
      const res = await fetch(`${apiBase}/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        throw new Error('No se pudo actualizar el rol del usuario');
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingUserRole(null);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="animate-spin text-teal-400" size={32} />
        </div>
      </Layout>
    );
  }

  if (!user || role !== 'ADMIN') {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex p-4 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
            <ShieldAlert size={48} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h1>
          <p className="text-slate-400">
            Esta sección es exclusiva para usuarios con rol <strong>Administrator</strong>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-900">
          <div>
            <div className="flex items-center gap-2 text-purple-400 text-xs font-extrabold uppercase tracking-wider mb-1">
              <ShieldCheck size={16} />
              <span>Control Panel</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Panel de Administración
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Gestión de tickers en base de datos y usuarios registrados.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition self-start md:self-auto cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar Datos</span>
          </button>
        </div>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-900 pb-3">
          <button
            onClick={() => setActiveTab('tickers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
              activeTab === 'tickers'
                ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                : 'text-slate-400 hover:bg-slate-900 border-transparent'
            }`}
          >
            <BarChart2 size={16} />
            <span>Tickers Existentes ({tickers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
              activeTab === 'users'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : 'text-slate-400 hover:bg-slate-900 border-transparent'
            }`}
          >
            <Users size={16} />
            <span>Usuarios Registrados ({users.length})</span>
          </button>
        </div>

        {/* Tickers Section */}
        {activeTab === 'tickers' && (
          <div className="bg-slate-950/60 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-900 bg-slate-900/30 flex justify-between items-center text-xs text-slate-400">
              <span className="font-bold">Listado de Activos y Última Actualización en BD</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/50 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-900">
                  <tr>
                    <th className="p-4">Symbol</th>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Precio</th>
                    <th className="p-4">Score BHT</th>
                    <th className="p-4">Recomendación</th>
                    <th className="p-4">Última Actualización en BD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60">
                  {tickers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/30 transition">
                      <td className="p-4 font-extrabold text-teal-400">{t.symbol}</td>
                      <td className="p-4 font-semibold text-white">{t.name}</td>
                      <td className="p-4 font-bold text-slate-200">${t.price.toFixed(2)}</td>
                      <td className="p-4 font-bold text-amber-400">{t.buyHoldIndex} / 100</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">
                          {t.recommendation}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
                        <Clock size={12} className="text-slate-500" />
                        <span>{new Date(t.updatedAt).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Section */}
        {activeTab === 'users' && (
          <div className="bg-slate-950/60 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-900 bg-slate-900/30 flex justify-between items-center text-xs text-slate-400">
              <span className="font-bold">Usuarios en PostgreSQL y Asignación de Roles</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/50 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-900">
                  <tr>
                    <th className="p-4">Email</th>
                    <th className="p-4">Nombre y Apellidos</th>
                    <th className="p-4">Fecha de Registro</th>
                    <th className="p-4">Rol Asignado</th>
                    <th className="p-4">Cambiar Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/30 transition">
                      <td className="p-4 font-bold text-white">{u.email}</td>
                      <td className="p-4 font-medium text-slate-300">
                        {u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '—'}
                      </td>
                      <td className="p-4 text-slate-400 font-mono text-[11px]">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : u.role === 'PRO_USER'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          disabled={updatingUserRole === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer disabled:opacity-50"
                        >
                          <option value="FREE_USER">Free User</option>
                          <option value="PRO_USER">Premium User</option>
                          <option value="ADMIN">Administrator</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
