'use client';

interface ClientFormProps {
  isFr: boolean;
  editClientName: string;
  editClientPhone: string;
  editClientEmail: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeEmail: (v: string) => void;
}

export function ClientEditForm({
  isFr, editClientName, editClientPhone, editClientEmail,
  onChangeName, onChangePhone, onChangeEmail,
}: ClientFormProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
        {isFr ? 'Client' : 'Client'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Nom *' : 'Name *'}
          </label>
          <input
            value={editClientName}
            onChange={e => onChangeName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
            placeholder={isFr ? 'Nom du client' : 'Client name'}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Téléphone' : 'Phone'}
          </label>
          <input
            value={editClientPhone}
            onChange={e => onChangePhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
            placeholder="+212..."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Email facture' : 'Invoice email'}
          </label>
          <input
            type="email"
            value={editClientEmail}
            onChange={e => onChangeEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
            placeholder="email@example.com"
          />
        </div>
      </div>
    </div>
  );
}

interface MetadataFormProps {
  isFr: boolean;
  editIssuedAt: string;
  editStatus: string;
  onChangeIssuedAt: (v: string) => void;
  onChangeStatus: (v: string) => void;
}

export function MetadataEditForm({
  isFr, editIssuedAt, editStatus, onChangeIssuedAt, onChangeStatus,
}: MetadataFormProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
        {isFr ? 'Informations' : 'Details'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Date de facturation' : 'Invoice date'}
          </label>
          <input
            type="date"
            value={editIssuedAt}
            onChange={e => onChangeIssuedAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Statut' : 'Status'}
          </label>
          <select
            value={editStatus}
            onChange={e => onChangeStatus(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
          >
            <option value="PENDING">{isFr ? 'En attente' : 'Pending'}</option>
            <option value="PARTIALLY_PAID">{isFr ? 'Partiel' : 'Partial'}</option>
            <option value="PAID">{isFr ? 'Payée' : 'Paid'}</option>
            <option value="CANCELLED">{isFr ? 'Annulée' : 'Cancelled'}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

interface NotesFormProps {
  isFr: boolean;
  editNotes: string;
  onChangeNotes: (v: string) => void;
}

export function NotesEditForm({ isFr, editNotes, onChangeNotes }: NotesFormProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
        {isFr ? 'Notes (optionnel)' : 'Notes (optional)'}
      </label>
      <textarea
        value={editNotes}
        onChange={e => onChangeNotes(e.target.value)}
        rows={3}
        placeholder={isFr ? 'Notes internes...' : 'Internal notes...'}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 resize-none"
      />
    </div>
  );
}
