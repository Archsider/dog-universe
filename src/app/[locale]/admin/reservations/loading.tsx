export default function ReservationsLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-gray-200 rounded-lg" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-48 bg-gray-200 rounded-lg" />
      </div>

      {/* View toggle + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
        <div className="flex-1" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-gray-100 rounded-full" />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Table header */}
        <div className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-gray-100">
          {['w-16', 'w-28', 'w-24', 'w-20', 'w-24', 'w-16'].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-gray-200 rounded`} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-6 gap-4 px-5 py-4 border-b border-gray-50 items-center"
          >
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
            <div className="h-5 w-20 bg-gray-100 rounded-full" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-7 w-14 bg-gray-200 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-end gap-2">
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}
