export default function LoyaltyLoading() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      {/* Header with icon */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-gray-200 rounded-xl" />
        <div className="space-y-1.5">
          <div className="h-6 w-44 bg-gray-200 rounded" />
          <div className="h-3 w-36 bg-gray-100 rounded" />
        </div>
      </div>

      {/* Tabs: PENDING / APPROVED / REJECTED */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-white rounded-lg" />
        ))}
      </div>

      {/* Claims list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          {['w-32', 'w-28', 'w-24', 'w-20', 'w-16'].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-gray-200 rounded`} />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-5 py-4 border-b border-gray-50 items-center"
          >
            {/* Client name + email */}
            <div className="space-y-1.5">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-3 w-36 bg-gray-100 rounded" />
            </div>
            {/* Benefit key */}
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
            {/* Date */}
            <div className="h-3 w-20 bg-gray-100 rounded" />
            {/* Status badge */}
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            {/* Actions */}
            <div className="flex gap-2">
              <div className="h-8 w-20 bg-gray-200 rounded-lg" />
              <div className="h-8 w-20 bg-gray-100 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
