import { ZoneNowSkeleton, ZoneWeekSkeleton, ZoneAlertsSkeleton } from './_components/Skeletons';

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-48 bg-[#F5EAD0]/70 rounded-lg animate-pulse" />
      <ZoneNowSkeleton />
      <ZoneWeekSkeleton />
      <ZoneAlertsSkeleton />
    </div>
  );
}
