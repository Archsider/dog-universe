export default function BillingLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + month navigator */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-gray-200 rounded-lg" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-gray-200 rounded-lg" />
          <div className="h-6 w-28 bg-gray-200 rounded" />
          <div className="h-9 w-9 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-7 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Payment methods breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="grid grid-cols-4 gap-4 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-14 bg-gray-100 rounded" />
              <div className="h-5 w-20 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-gray-100 rounded-full" />
        ))}
      </div>

      {/* Invoices table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          {['w-24', 'w-32', 'w-20', 'w-24', 'w-20', 'w-16'].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-gray-200 rounded`} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-4 px-5 py-4 border-b border-gray-50 items-center">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-7 w-14 bg-gray-200 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
