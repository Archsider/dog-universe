import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ShieldCheck, Shield, User, AlertTriangle } from 'lucide-react';
import { getInitials, formatDate } from '@/lib/utils';
import ChangeRoleButton from './ChangeRoleButton';
import ProductionResetPanel from './ProductionResetPanel';

interface PageProps { params: { locale: string } }

export default async function AdminUsersPage({ params: { locale } }: PageProps) {
  const session = await auth();
  // SUPERADMIN only
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const l = locale === 'fr' ? {
    title: 'Gestion des administrateurs',
    subtitle: 'Gérez les rôles ADMIN et SUPERADMIN',
    warning: 'Seul le SUPERADMIN peut accéder à cette section et modifier les rôles.',
    colName: 'Nom',
    colEmail: 'Email',
    colRole: 'Rôle',
    colSince: 'Depuis',
    colAction: 'Actions',
    promote: 'Promouvoir SUPERADMIN',
    demote: 'Rétrograder en ADMIN',
    you: 'Vous',
    noAdmins: 'Aucun administrateur',
    bootstrapTitle: 'Ajouter un administrateur ?',
    bootstrapDesc: 'Pour créer un nouveau compte ADMIN, créez d\'abord un client puis changez son rôle via ce panneau.',
  } : {
    title: 'Admin User Management',
    subtitle: 'Manage ADMIN and SUPERADMIN roles',
    warning: 'Only SUPERADMIN can access this section and change roles.',
    colName: 'Name',
    colEmail: 'Email',
    colRole: 'Role',
    colSince: 'Since',
    colAction: 'Actions',
    promote: 'Promote to SUPERADMIN',
    demote: 'Demote to ADMIN',
    you: 'You',
    noAdmins: 'No administrators',
    bootstrapTitle: 'Add an administrator?',
    bootstrapDesc: 'To create a new ADMIN account, first create a client account then change their role from this panel.',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{l.subtitle}</p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">{l.warning}</p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold-50 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-5 w-5 text-gold-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-charcoal">SUPERADMIN</div>
            <div className="text-xs text-gray-500">{locale === 'fr' ? 'Accès total + gestion des rôles' : 'Full access + role management'}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-charcoal">ADMIN</div>
            <div className="text-xs text-gray-500">{locale === 'fr' ? 'Gestion complète sans rôles' : 'Full management, no role changes'}</div>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{l.noAdmins}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.colName}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.colEmail}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">{l.colRole}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.colSince}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{l.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isCurrentUser = user.id === session.user.id;
                  return (
                    <tr key={user.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-xs font-semibold text-gold-700 flex-shrink-0">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <span className="font-medium text-sm text-charcoal">{user.name}</span>
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-gold-600 font-medium">({l.you})</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{user.email}</td>
                      <td className="px-4 py-3 text-center">
                        {user.role === 'SUPERADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold-50 text-gold-700 text-xs font-semibold border border-gold-200">
                            <ShieldCheck className="h-3 w-3" />
                            SUPERADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                            <Shield className="h-3 w-3" />
                            ADMIN
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        {formatDate(user.createdAt.toISOString())}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCurrentUser && (
                          <ChangeRoleButton
                            userId={user.id}
                            currentRole={user.role}
                            locale={locale}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <p className="text-sm font-semibold text-charcoal mb-1">{l.bootstrapTitle}</p>
        <p className="text-sm text-gray-500">{l.bootstrapDesc}</p>
      </div>

      {/* Production reset — danger zone */}
      <div>
        <h2 className="text-lg font-serif font-semibold text-charcoal mb-3">
          {locale === 'fr' ? 'Zone de danger' : 'Danger zone'}
        </h2>
        <ProductionResetPanel locale={locale} />
      </div>
    </div>
  );
}
