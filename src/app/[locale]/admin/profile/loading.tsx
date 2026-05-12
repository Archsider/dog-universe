export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-52 bg-gray-200 rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-14" />
        ))}
      </div>
    </div>
  );
}
