'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  currentRole: string;
  locale: string;
}

export default function ChangeRoleButton({ userId, currentRole, locale }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const changeRole = async (newRole: string) => {
    const label = locale === 'fr' ? newRole : newRole;
    const confirmMsg = locale === 'fr'
      ? `Changer ce rôle en ${newRole} ?`
      : `Change this role to ${newRole}?`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert(locale === 'fr' ? 'Erreur lors du changement de rôle' : 'Error changing role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      {currentRole === 'SUPERADMIN' ? (
        <button
          onClick={() => changeRole('ADMIN')}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : (locale === 'fr' ? 'Rétrograder ADMIN' : 'Demote to ADMIN')}
        </button>
      ) : (
        <>
          <button
            onClick={() => changeRole('SUPERADMIN')}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gold-200 text-gold-700 hover:bg-gold-50 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : (locale === 'fr' ? 'Promouvoir SUPERADMIN' : 'Promote to SUPERADMIN')}
          </button>
          <button
            onClick={() => changeRole('CLIENT')}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : (locale === 'fr' ? 'Retirer admin' : 'Remove admin')}
          </button>
        </>
      )}
    </div>
  );
}
