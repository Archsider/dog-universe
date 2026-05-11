import { toast } from '@/hooks/use-toast';

interface GeoLabels {
  geoDenied: string;
  geoUnavailable: string;
  geoInsecure: string;
  geoTimeout: string;
  locating: string;
}

export function requestGeo(
  locale: string,
  onCoords: (lat: number, lng: number) => void,
  onAddress: (addr: string) => void,
  setLoading: (v: boolean) => void,
  labels: GeoLabels,
) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    toast({ title: labels.geoUnavailable, variant: 'destructive' });
    return;
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    toast({ title: labels.geoInsecure, variant: 'destructive' });
    return;
  }
  setLoading(true);
  toast({ title: labels.locating, description: '…', duration: 3000 });
  // Manual watchdog: some browsers (Chrome desktop, certain proxies) silently
  // hang on getCurrentPosition without ever firing success/error. Force a
  // resolution after 9s to guarantee the user gets feedback.
  let settled = false;
  const watchdog = setTimeout(() => {
    if (settled) return;
    settled = true;
    setLoading(false);
    toast({ title: labels.geoTimeout, variant: 'destructive' });
  }, 9_000);
  try {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        const { latitude, longitude } = pos.coords;
        onCoords(latitude, longitude);
        try {
          const res = await fetch(
            `/api/geocode/reverse?lat=${latitude}&lng=${longitude}&lang=${locale}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (typeof data?.address === 'string') onAddress(data.address);
          }
        } catch { /* silent: lat/lng captured, user can edit address manually */ } finally { setLoading(false); }
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        setLoading(false);
        const msg =
          err.code === 1 ? labels.geoDenied :
          err.code === 2 ? labels.geoUnavailable :
          err.code === 3 ? labels.geoTimeout :
          labels.geoUnavailable;
        toast({ title: msg, variant: 'destructive' });
      },
      { timeout: 8_000, enableHighAccuracy: false, maximumAge: 30_000 },
    );
  } catch {
    if (!settled) {
      settled = true;
      clearTimeout(watchdog);
      setLoading(false);
      toast({ title: labels.geoUnavailable, variant: 'destructive' });
    }
  }
}
