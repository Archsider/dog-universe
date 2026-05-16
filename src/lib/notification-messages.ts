/**
 * Centralized localized notification messages.
 *
 * Neutral file (no 'use client' directive) — can be imported by both Server
 * Components and Client Components without triggering Next.js 15 client-ref
 * wrapping issues.
 *
 * Each entry is a function that receives a data record and returns the six
 * localized string fields expected by `createNotification` (FR + EN + AR).
 */

export type LocalizedMessage = {
  titleFr: string;
  titleEn: string;
  titleAr: string;
  messageFr: string;
  messageEn: string;
  messageAr: string;
};

type MessageFactory = (data: Record<string, string>) => LocalizedMessage;

export const NOTIFICATION_MESSAGES: Record<string, MessageFactory> = {
  // ── Client booking lifecycle ────────────────────────────────────────────────

  BOOKING_CONFIRMATION: ({ petName, bookingRef }) => ({
    titleFr: 'Demande de réservation envoyée',
    titleEn: 'Booking request sent',
    titleAr: 'تم إرسال طلب الحجز',
    messageFr: `Votre demande de réservation pour ${petName} (réf. ${bookingRef}) a bien été reçue. Notre équipe vous confirmera sous 24h.`,
    messageEn: `Your booking request for ${petName} (ref. ${bookingRef}) has been received. Our team will confirm within 24 hours.`,
    messageAr: `تم استلام طلب الحجز الخاص بك من أجل ${petName} (المرجع ${bookingRef}). سيؤكد فريقنا في غضون 24 ساعة.`,
  }),

  BOOKING_VALIDATION: ({ petName, bookingRef, dates }) => ({
    titleFr: 'Réservation confirmée !',
    titleEn: 'Booking confirmed!',
    titleAr: 'تم تأكيد الحجز!',
    messageFr: `Votre réservation pour ${petName} (${dates}) a été confirmée. Réf. : ${bookingRef}`,
    messageEn: `Your booking for ${petName} (${dates}) has been confirmed. Ref: ${bookingRef}`,
    messageAr: `تم تأكيد حجزك من أجل ${petName} (${dates}). المرجع: ${bookingRef}`,
  }),

  BOOKING_REFUSAL: ({ bookingRef, reason }) => ({
    titleFr: 'Réservation non disponible',
    titleEn: 'Booking unavailable',
    titleAr: 'الحجز غير متاح',
    messageFr: `Votre réservation (réf. ${bookingRef}) ne peut pas être honorée.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your booking (ref. ${bookingRef}) cannot be accommodated.${reason ? ` Reason: ${reason}` : ''}`,
    messageAr: `لا يمكن قبول حجزك (المرجع ${bookingRef}).${reason ? ` السبب: ${reason}` : ''}`,
  }),

  BOOKING_IN_PROGRESS_BOARDING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour en cours',
    titleEn: 'Stay in progress',
    titleAr: 'الإقامة جارية',
    messageFr: `${petName} est bien arrivé(e) dans nos locaux — le séjour a commencé (réf. ${bookingRef}).`,
    messageEn: `${petName} has arrived safely at our facility — the stay has begun (ref. ${bookingRef}).`,
    messageAr: `وصل ${petName} إلى مرافقنا بأمان — بدأت الإقامة (المرجع ${bookingRef}).`,
  }),

  BOOKING_IN_PROGRESS_TAXI: ({ petName, bookingRef }) => ({
    titleFr: 'Animal à bord',
    titleEn: 'Pet on board',
    titleAr: 'الحيوان على متن المركبة',
    messageFr: `${petName} est à bord et en route avec notre équipe (réf. ${bookingRef}).`,
    messageEn: `${petName} is on board and on the way with our team (ref. ${bookingRef}).`,
    messageAr: `${petName} على المتن وفي الطريق مع فريقنا (المرجع ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_TAXI: ({ petName, bookingRef }) => ({
    titleFr: 'Trajet terminé',
    titleEn: 'Trip completed',
    titleAr: 'انتهت الرحلة',
    messageFr: `${petName} est arrivé(e) à destination (réf. ${bookingRef}).`,
    messageEn: `${petName} has arrived at the destination (ref. ${bookingRef}).`,
    messageAr: `وصل ${petName} إلى الوجهة (المرجع ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_WITH_GROOMING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour & toilettage terminés',
    titleEn: 'Stay & grooming completed',
    titleAr: 'انتهت الإقامة والعناية',
    messageFr: `Le séjour et le toilettage de ${petName} sont terminés — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`,
    messageEn: `${petName}'s stay and grooming are complete — your companion is ready to be picked up (ref. ${bookingRef}).`,
    messageAr: `انتهت إقامة ${petName} وجلسة العناية — رفيقك جاهز للاستلام (المرجع ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_BOARDING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour terminé',
    titleEn: 'Stay completed',
    titleAr: 'انتهت الإقامة',
    messageFr: `Le séjour de ${petName} est terminé — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`,
    messageEn: `${petName}'s stay is complete — your companion is ready to be picked up (ref. ${bookingRef}).`,
    messageAr: `انتهت إقامة ${petName} — رفيقك جاهز للاستلام (المرجع ${bookingRef}).`,
  }),

  BOOKING_EXTENDED: ({ bookingRef, newEndDate }) => ({
    titleFr: 'Séjour prolongé',
    titleEn: 'Stay extended',
    titleAr: 'تم تمديد الإقامة',
    messageFr: `Votre séjour (réf. ${bookingRef}) a été prolongé. Nouvelle date de sortie : ${newEndDate}.`,
    messageEn: `Your stay (ref. ${bookingRef}) has been extended. New checkout date: ${newEndDate}.`,
    messageAr: `تم تمديد إقامتك (المرجع ${bookingRef}). تاريخ المغادرة الجديد: ${newEndDate}.`,
  }),

  BOOKING_EXTENSION_REJECTED: ({ bookingRef }) => ({
    titleFr: 'Demande de prolongation refusée',
    titleEn: 'Extension request declined',
    titleAr: 'تم رفض طلب التمديد',
    messageFr: `Votre demande de prolongation pour la réservation ${bookingRef} n'a pas pu être acceptée. Contactez-nous pour plus d'informations.`,
    messageEn: `Your extension request for booking ${bookingRef} could not be approved. Please contact us for more details.`,
    messageAr: `لم نتمكن من قبول طلب التمديد للحجز ${bookingRef}. يرجى التواصل معنا للمزيد من المعلومات.`,
  }),

  BOOKING_NO_SHOW: ({ petName, bookingRef }) => ({
    titleFr: 'Réservation marquée comme No Show',
    titleEn: 'Booking marked as No Show',
    titleAr: 'تم تسجيل الحجز كعدم حضور',
    messageFr: `Votre réservation pour ${petName} (réf. ${bookingRef}) a été marquée No Show suite à une absence non signalée. Contactez-nous pour toute question.`,
    messageEn: `Your booking for ${petName} (ref. ${bookingRef}) was marked No Show due to unreported absence. Please contact us if you have any questions.`,
    messageAr: `تم تسجيل حجزك من أجل ${petName} (المرجع ${bookingRef}) كعدم حضور بسبب غياب غير مُبلَّغ عنه. يرجى التواصل معنا في حال وجود أي استفسار.`,
  }),

  BOOKING_WAITLISTED: ({ petName, bookingRef }) => ({
    titleFr: "Inscription sur liste d'attente",
    titleEn: 'Added to waitlist',
    titleAr: 'تمت الإضافة إلى قائمة الانتظار',
    messageFr: `La pension est complète sur ces dates. ${petName} (réf. ${bookingRef}) est en liste d'attente — nous vous contactons dès qu'une place se libère.`,
    messageEn: `The boarding is full for these dates. ${petName} (ref. ${bookingRef}) is on the waitlist — we'll reach out as soon as a slot opens up.`,
    messageAr: `الفندق ممتلئ في هذه التواريخ. ${petName} (المرجع ${bookingRef}) في قائمة الانتظار — سنتواصل معك بمجرد توفر مكان.`,
  }),

  BOOKING_WAITLIST_PROMOTED: ({ petName, bookingRef }) => ({
    titleFr: "Une place s'est libérée !",
    titleEn: 'A slot just opened up!',
    titleAr: 'تم تحرير مكان!',
    messageFr: `Bonne nouvelle : une place s'est libérée pour ${petName} (réf. ${bookingRef}). Votre réservation est maintenant en attente de confirmation.`,
    messageEn: `Good news: a slot is now available for ${petName} (ref. ${bookingRef}). Your booking is now pending confirmation.`,
    messageAr: `خبر سار: أصبح هناك مكان متاح لـ ${petName} (المرجع ${bookingRef}). حجزك الآن في انتظار التأكيد.`,
  }),

  // ── Invoices ───────────────────────────────────────────────────────────────

  INVOICE_AVAILABLE: ({ invoiceNumber, amount }) => ({
    titleFr: 'Nouvelle facture disponible',
    titleEn: 'New invoice available',
    titleAr: 'فاتورة جديدة متاحة',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} est disponible.`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} is now available.`,
    messageAr: `فاتورتك ${invoiceNumber} بمبلغ ${amount} متاحة الآن.`,
  }),

  INVOICE_PAID: ({ invoiceNumber, amount }) => ({
    titleFr: 'Paiement confirmé',
    titleEn: 'Payment confirmed',
    titleAr: 'تم تأكيد الدفع',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} a bien été réglée. Merci !`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} has been paid. Thank you!`,
    messageAr: `تم سداد فاتورتك ${invoiceNumber} بمبلغ ${amount}. شكراً لك!`,
  }),

  // ── Loyalty ────────────────────────────────────────────────────────────────

  LOYALTY_UPDATE: ({ gradeFr, gradeEn }) => ({
    titleFr: 'Grade de fidélité mis à jour',
    titleEn: 'Loyalty grade updated',
    titleAr: 'تم تحديث مستوى الولاء',
    messageFr: `Félicitations ! Votre grade de fidélité a été mis à jour : ${gradeFr}.`,
    messageEn: `Congratulations! Your loyalty grade has been updated: ${gradeEn}.`,
    messageAr: `تهانينا! تم تحديث مستوى الولاء الخاص بك: ${gradeEn}.`,
  }),

  LOYALTY_CLAIM_APPROVED: ({ benefitFr, benefitEn }) => ({
    titleFr: 'Avantage fidélité accordé',
    titleEn: 'Loyalty benefit granted',
    titleAr: 'تم منح ميزة الولاء',
    messageFr: `Votre demande pour « ${benefitFr} » a été acceptée. Notre équipe vous contactera pour la mise en place.`,
    messageEn: `Your request for "${benefitEn}" has been approved. Our team will contact you shortly.`,
    messageAr: `تم قبول طلبك بخصوص «${benefitEn}». سيتواصل معك فريقنا قريباً لتنفيذه.`,
  }),

  LOYALTY_CLAIM_REJECTED: ({ benefitFr, benefitEn, reason }) => ({
    titleFr: "Réclamation d'avantage refusée",
    titleEn: 'Benefit claim rejected',
    titleAr: 'تم رفض طلب الميزة',
    messageFr: `Votre demande pour « ${benefitFr} » a été refusée.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your request for "${benefitEn}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
    messageAr: `تم رفض طلبك بخصوص «${benefitEn}».${reason ? ` السبب: ${reason}` : ''}`,
  }),

  // ── Stay end reminder (J-1) — taxi/no-taxi conditional ─────────────────────

  STAY_END_REMINDER: ({ petName, endDateFr, endDateEn, hasTaxi, articleFr }) => {
    const taxi = hasTaxi === '1';
    return {
      titleFr: 'Fin de séjour demain',
      titleEn: 'Stay ending tomorrow',
      titleAr: 'الإقامة تنتهي غداً',
      messageFr: taxi
        ? `Le séjour de ${petName} se termine demain (${endDateFr}). Nous vous ${articleFr} ramenons à la maison.`
        : `Le séjour de ${petName} se termine demain (${endDateFr}). On vous attend à la pension pour les retrouvailles.`,
      messageEn: taxi
        ? `${petName}'s stay ends tomorrow (${endDateEn}). We bring them home.`
        : `${petName}'s stay ends tomorrow (${endDateEn}). See you at the boarding for the reunion.`,
      messageAr: taxi
        ? `تنتهي إقامة ${petName} غداً (${endDateEn}). سنقوم بإعادته إلى المنزل.`
        : `تنتهي إقامة ${petName} غداً (${endDateEn}). نراك في الفندق للقاء.`,
    };
  },

  STAY_END_REMINDER_ADMIN: ({ clientName, petNames, bookingRef }) => ({
    titleFr: `Départ demain — ${petNames}`,
    titleEn: `Check-out tomorrow — ${petNames}`,
    titleAr: `مغادرة غداً — ${petNames}`,
    messageFr: `${clientName} récupère ${petNames} demain (réf. ${bookingRef}).`,
    messageEn: `${clientName} picks up ${petNames} tomorrow (ref. ${bookingRef}).`,
    messageAr: `${clientName} سيستلم ${petNames} غداً (المرجع ${bookingRef}).`,
  }),

  // ── Stay media ─────────────────────────────────────────────────────────────

  STAY_PHOTO: ({ petName, bookingRef }) => ({
    titleFr: '📸 Nouvelles photos de séjour',
    titleEn: '📸 New stay photos',
    titleAr: '📸 صور جديدة من الإقامة',
    messageFr: `De nouvelles photos de ${petName} ont été publiées pour votre réservation (réf. ${bookingRef}).`,
    messageEn: `New photos of ${petName} have been posted for your booking (ref. ${bookingRef}).`,
    messageAr: `تم نشر صور جديدة لـ ${petName} لحجزك (المرجع ${bookingRef}).`,
  }),

  STAY_PHOTO_ADDED: ({ names, namesEn }) => ({
    titleFr: '📸 Nouvelles photos de votre séjour',
    titleEn: '📸 New photos from your stay',
    titleAr: '📸 صور جديدة من إقامتك',
    messageFr: `De nouvelles photos de ${names} ont été partagées par l'équipe Dog Universe 🐾`,
    messageEn: `New photos of ${namesEn} were shared by the Dog Universe team 🐾`,
    messageAr: `قام فريق Dog Universe بمشاركة صور جديدة لـ ${namesEn} 🐾`,
  }),

  // ── Taxi GPS ───────────────────────────────────────────────────────────────

  TAXI_NEAR_PICKUP: () => ({
    titleFr: '🚗 Votre chauffeur arrive',
    titleEn: '🚗 Your driver is arriving',
    titleAr: '🚗 السائق في طريقه إليك',
    messageFr: 'Votre chauffeur arrive dans environ 5 minutes !',
    messageEn: 'Your driver is arriving in about 5 minutes!',
    messageAr: 'سيصل السائق خلال حوالي 5 دقائق!',
  }),

  TAXI_ARRIVED: () => ({
    titleFr: '✅ Votre chauffeur est arrivé',
    titleEn: '✅ Your driver has arrived',
    titleAr: '✅ وصل السائق',
    messageFr: "Votre chauffeur vient d'arriver à votre adresse.",
    messageEn: 'Your driver has just arrived at your address.',
    messageAr: 'وصل السائق للتو إلى عنوانك.',
  }),

  TAXI_ARRIVING_SOON: ({ minutes }) => ({
    titleFr: '🚗 Votre chauffeur arrive bientôt',
    titleEn: '🚗 Your driver is arriving soon',
    titleAr: '🚗 السائق يصل قريبا',
    messageFr: `Votre chauffeur arrive dans ${minutes} minute${Number(minutes) > 1 ? 's' : ''}.`,
    messageEn: `Your driver arrives in ${minutes} minute${Number(minutes) > 1 ? 's' : ''}.`,
    messageAr: `السائق يصل في ${minutes} دقائق.`,
  }),

  // ── Admin notifications ────────────────────────────────────────────────────

  BOOKING_REQUEST: ({ clientName, serviceTypeFr, serviceTypeEn, petNames, bookingRef }) => ({
    titleFr: 'Nouvelle demande de réservation',
    titleEn: 'New booking request',
    titleAr: 'طلب حجز جديد',
    messageFr: `${clientName} a soumis une demande de ${serviceTypeFr} pour ${petNames} — réf. ${bookingRef}`,
    messageEn: `${clientName} submitted a ${serviceTypeEn} request for ${petNames} — ref. ${bookingRef}`,
    messageAr: `${clientName} قدّم طلب ${serviceTypeEn} من أجل ${petNames} — المرجع ${bookingRef}`,
  }),

  NEW_CLIENT_REGISTRATION: ({ clientName, clientEmail, phonePart }) => ({
    titleFr: 'Nouveau client inscrit',
    titleEn: 'New client registered',
    titleAr: 'تسجيل عميل جديد',
    messageFr: `${clientName} (${clientEmail}${phonePart}) vient de créer un compte.`,
    messageEn: `${clientName} (${clientEmail}${phonePart}) just created an account.`,
    messageAr: `${clientName} (${clientEmail}${phonePart}) قام بإنشاء حساب للتو.`,
  }),

  LOYALTY_CLAIM_PENDING: ({ clientName, benefitFr, benefitEn }) => ({
    titleFr: "Nouvelle réclamation d'avantage fidélité",
    titleEn: 'New loyalty benefit claim',
    titleAr: 'طلب ميزة ولاء جديد',
    messageFr: `${clientName} demande : « ${benefitFr} »`,
    messageEn: `${clientName} requests: "${benefitEn}"`,
    messageAr: `${clientName} يطلب: «${benefitEn}»`,
  }),

  TAXI_HEARTBEAT_LOST: ({ clientName, petNames, bookingRef }) => ({
    titleFr: 'Taxi : signal GPS perdu',
    titleEn: 'Taxi: GPS signal lost',
    titleAr: 'تاكسي: انقطع إشارة GPS',
    messageFr: `⚠️ Pas de signal GPS depuis 5 min — ${clientName} / ${petNames} / Réservation ${bookingRef}`,
    messageEn: `⚠️ No GPS signal for 5 min — ${clientName} / ${petNames} / Booking ${bookingRef}`,
    messageAr: `⚠️ لا توجد إشارة GPS منذ 5 دقائق — ${clientName} / ${petNames} / الحجز ${bookingRef}`,
  }),

  EXTENSION_REQUEST: ({ clientName, petNames, bookingRef, requestedEndDate }) => ({
    titleFr: 'Demande de prolongation de séjour',
    titleEn: 'Stay extension request',
    titleAr: 'طلب تمديد الإقامة',
    messageFr: `${clientName} demande une prolongation pour ${petNames} (réf. ${bookingRef}) — nouvelle date de sortie souhaitée : ${requestedEndDate}`,
    messageEn: `${clientName} requests a stay extension for ${petNames} (ref. ${bookingRef}) — requested new checkout: ${requestedEndDate}`,
    messageAr: `${clientName} يطلب تمديد الإقامة لـ ${petNames} (المرجع ${bookingRef}) — تاريخ المغادرة الجديد المطلوب: ${requestedEndDate}`,
  }),

  PRODUCT_ORDER: ({ clientName, productName, quantity, petNames }) => ({
    titleFr: 'Commande produit par un client',
    titleEn: 'Product order from client',
    titleAr: 'طلب منتج من العميل',
    messageFr: `${clientName} a commandé ${productName} × ${quantity} pour ${petNames}`,
    messageEn: `${clientName} ordered ${productName} × ${quantity} for ${petNames}`,
    messageAr: `${clientName} طلب ${productName} × ${quantity} لـ ${petNames}`,
  }),

  // ── Time confirmation (TimeProposal lifecycle) ──────────────────────────

  BOOKING_TIME_PROPOSED: ({ scopeLabelFr, scopeLabelEn, time, note }) => ({
    titleFr: 'Heure proposée par l’équipe',
    titleEn: 'Time proposed by the team',
    titleAr: 'الوقت المقترح من قبل الفريق',
    messageFr: `Nous vous proposons ${time} pour ${scopeLabelFr}. ${note ? `Note : ${note}. ` : ''}Cliquez sur le lien dans votre email pour accepter ou nous contacter via WhatsApp.`,
    messageEn: `We propose ${time} for ${scopeLabelEn}. ${note ? `Note: ${note}. ` : ''}Click the email link to accept or reach us via WhatsApp.`,
    messageAr: `نقترح ${time} لـ ${scopeLabelEn}. ${note ? `${note}. ` : ''}اضغط على الرابط في بريدك الإلكتروني لقبوله أو تواصل معنا.`,
  }),

  BOOKING_TIME_CONFIRMED: ({ scopeLabelFr, scopeLabelEn, time }) => ({
    titleFr: 'Heure confirmée',
    titleEn: 'Time confirmed',
    titleAr: 'تم تأكيد الوقت',
    messageFr: `Votre ${scopeLabelFr} est désormais confirmée à ${time}.`,
    messageEn: `Your ${scopeLabelEn} is now confirmed at ${time}.`,
    messageAr: `تم تأكيد ${scopeLabelEn} على الساعة ${time}.`,
  }),

  BOOKING_CANCELLED: ({ bookingRef, reason }) => ({
    titleFr: 'Réservation annulée',
    titleEn: 'Booking cancelled',
    titleAr: 'تم إلغاء الحجز',
    messageFr: `Votre réservation ${bookingRef} a été annulée par l’équipe.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your booking ${bookingRef} has been cancelled by the team.${reason ? ` Reason: ${reason}` : ''}`,
    messageAr: `تم إلغاء حجزك ${bookingRef} من قبل الفريق.${reason ? ` السبب: ${reason}` : ''}`,
  }),

  INVOICE_CANCELLED: ({ invoiceNumber, reason, amount }) => ({
    titleFr: 'Facture annulée',
    titleEn: 'Invoice cancelled',
    titleAr: 'تم إلغاء الفاتورة',
    messageFr: `Votre facture ${invoiceNumber} (${amount} MAD) a été annulée par l’équipe.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your invoice ${invoiceNumber} (${amount} MAD) has been cancelled by the team.${reason ? ` Reason: ${reason}` : ''}`,
    messageAr: `تم إلغاء فاتورتك ${invoiceNumber} (${amount} درهم) من قبل الفريق.${reason ? ` السبب: ${reason}` : ''}`,
  }),
};
