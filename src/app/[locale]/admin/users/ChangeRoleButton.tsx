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

  const newRole = currentRole === 'SUPERADMIN' ? 'ADMIN' : 'SUPERADMIN';
  const label = locale === 'fr'
    ? (currentRole === 'SUPERADMIN' ? 'Rétrograder ADMIN' : 'Promouvoir SUPERADMIN')
    : (currentRole === 'SUPERADMIN' ? 'Demote to ADMIN' : 'Promote to SUPERADMIN');

  const handleClick = async () => {
    if (!confirm(locale === 'fr'
      ? `Changer ce rôle en ${newRole} ?`
      : `Change this role to ${newRole}?`)) return;

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
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
        currentRole === 'SUPERADMIN'
          ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
          : 'border-gold-200 text-gold-700 hover:bg-gold-50'
      }`}
    >
      {loading ? '...' : label}
    </button>
  );
}
