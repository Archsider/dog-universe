import { MessageSquare } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { BookingDetailTranslations } from '../_lib/i18n';

interface AdminMessage {
  id: string;
  createdAt: Date;
  messageFr: string;
  messageEn: string;
}

interface BookingMessagesCardProps {
  messages: AdminMessage[];
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingMessagesCard({ messages, locale, t }: BookingMessagesCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.messages}</h3>
      </div>
      {messages.length === 0 ? (
        <p className="text-sm text-gray-400">{t.noMessages}</p>
      ) : (
        <div className="space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className="bg-[#FEFCE8] border border-[#F0D98A]/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-5 h-5 rounded-full bg-gold-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">D</span>
                </div>
                <span className="text-xs font-semibold text-gold-700">Dog Universe</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {formatDate(new Date(msg.createdAt), locale)}
                </span>
              </div>
              <p className="text-sm text-charcoal">
                {locale === 'en' ? msg.messageEn : msg.messageFr}
              </p>
              {/* Note: Arabic falls back to French for notification messages (no titleAr/messageAr in DB) */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
