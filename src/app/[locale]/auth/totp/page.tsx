import { TotpVerifyForm } from './TotpVerifyForm';

export default async function TotpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141428] p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-xl font-bold text-gray-900">Vérification en deux étapes</h1>
          <p className="text-sm text-gray-500 mt-2">
            Entrez le code de votre application d&apos;authentification
          </p>
        </div>
        <TotpVerifyForm />
      </div>
    </div>
  );
}
