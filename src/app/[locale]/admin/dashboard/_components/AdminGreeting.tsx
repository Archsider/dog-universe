// Admin greeting — same luxe header used on /client/dashboard, but tuned
// for ops context : the subtitle pill summarises today's operational load
// (arrivées, dans nos murs, à valider).  No countdown bar — admin has
// many bookings, not one.
//
// Source : Wave 5 polish round 2 (user request : 'le greeting sur mon
// panel admin aussi').

import GreetingHeader from '@/components/shared/GreetingHeader';

interface Props {
  firstName: string;
  locale: string;
  arrivalsToday: number;
  inPension: number;
  pending: number;
}

const CASA_OFFSET_MIN = 60;

function hourCasa(d: Date): number {
  const casaMs = d.getTime() + CASA_OFFSET_MIN * 60_000;
  return new Date(casaMs).getUTCHours();
}

function salutation(hour: number, locale: string): string {
  const fr = locale === 'fr';
  const ar = locale === 'ar';
  if (hour < 5)       return fr ? 'Bonne nuit' : ar ? 'تصبح على خير' : 'Good night';
  if (hour < 12)      return fr ? 'Bonjour'    : ar ? 'صباح الخير'   : 'Good morning';
  if (hour < 18)      return fr ? 'Bon après-midi' : ar ? 'مساء الخير' : 'Good afternoon';
  return fr ? 'Bonsoir' : ar ? 'مساء الخير' : 'Good evening';
}

function buildSubtitle({ locale, arrivalsToday, inPension, pending }: {
  locale: string;
  arrivalsToday: number;
  inPension: number;
  pending: number;
}): string {
  const fr = locale === 'fr';
  const ar = locale === 'ar';
  const parts: string[] = [];
  if (arrivalsToday > 0) {
    parts.push(fr
      ? `${arrivalsToday} arrivée${arrivalsToday > 1 ? 's' : ''} aujourd'hui`
      : ar ? `${arrivalsToday} وصول اليوم` : `${arrivalsToday} arrival${arrivalsToday > 1 ? 's' : ''} today`);
  }
  if (inPension > 0) {
    parts.push(fr
      ? `${inPension} dans nos murs`
      : ar ? `${inPension} داخل البنسيون` : `${inPension} on site`);
  }
  if (pending > 0) {
    parts.push(fr
      ? `${pending} à valider`
      : ar ? `${pending} في الانتظار` : `${pending} to validate`);
  }
  if (parts.length === 0) {
    return fr
      ? 'Pension calme aujourd\'hui ✨'
      : ar ? 'هادئ اليوم ✨' : 'Quiet day in the pension ✨';
  }
  return parts.join(' · ');
}

export default function AdminGreeting({
  firstName, locale, arrivalsToday, inPension, pending,
}: Props) {
  const now = new Date();
  return (
    <GreetingHeader
      salutation={salutation(hourCasa(now), locale)}
      firstName={firstName}
      subtitle={buildSubtitle({ locale, arrivalsToday, inPension, pending })}
      variant="light"
    />
  );
}
