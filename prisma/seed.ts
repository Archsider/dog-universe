import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, subDays, subMonths } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Dog Universe database...');

  // Clean existing data
  await prisma.actionLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.boardingDetail.deleteMany();
  await prisma.taxiDetail.deleteMany();
  await prisma.bookingPet.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.petDocument.deleteMany();
  await prisma.vaccination.deleteMany();
  await prisma.loyaltyGrade.deleteMany();
  await prisma.adminNote.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.pet.deleteMany();
  await prisma.user.deleteMany();

  // Create admin account
  const adminPassword = await bcrypt.hash('Admin2024!', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@doguniverse.ma',
      name: 'Dog Universe Admin',
      phone: '+212 600 000 000',
      passwordHash: adminPassword,
      role: 'ADMIN',
      language: 'fr',
    },
  });
  console.log('✅ Admin account created:', admin.email);

  // Create client account - Marie Dupont
  const clientPassword = await bcrypt.hash('Marie2024!', 12);
  const marie = await prisma.user.create({
    data: {
      email: 'marie.dupont@email.com',
      name: 'Marie Dupont',
      phone: '+33 6 12 34 56 78',
      passwordHash: clientPassword,
      role: 'CLIENT',
      language: 'fr',
    },
  });
  console.log('✅ Client account created:', marie.email);

  // Create loyalty grade for Marie (Gold)
  await prisma.loyaltyGrade.create({
    data: {
      clientId: marie.id,
      grade: 'GOLD',
      isOverride: false,
    },
  });

  // Create Marie's pets
  const max = await prisma.pet.create({
    data: {
      ownerId: marie.id,
      name: 'Max',
      species: 'DOG',
      breed: 'Golden Retriever',
      dateOfBirth: new Date('2017-03-15'),
      gender: 'MALE',
    },
  });

  const luna = await prisma.pet.create({
    data: {
      ownerId: marie.id,
      name: 'Luna',
      species: 'DOG',
      breed: 'Toy Poodle',
      dateOfBirth: new Date('2020-07-22'),
      gender: 'FEMALE',
    },
  });

  const mochi = await prisma.pet.create({
    data: {
      ownerId: marie.id,
      name: 'Mochi',
      species: 'CAT',
      breed: 'British Shorthair',
      dateOfBirth: new Date('2021-11-05'),
      gender: 'MALE',
    },
  });
  console.log('✅ Pets created: Max, Luna, Mochi');

  // Add vaccinations
  await prisma.vaccination.createMany({
    data: [
      {
        petId: max.id,
        date: new Date('2024-03-10'),
        vaccineType: 'Rage',
        comment: 'Rappel annuel effectué',
      },
      {
        petId: max.id,
        date: new Date('2024-03-10'),
        vaccineType: 'CHPPL',
        comment: 'Carré de base',
      },
      {
        petId: luna.id,
        date: new Date('2024-06-15'),
        vaccineType: 'Rage',
        comment: 'Primovaccination',
      },
      {
        petId: luna.id,
        date: new Date('2024-06-15'),
        vaccineType: 'CHPPL',
      },
      {
        petId: mochi.id,
        date: new Date('2024-01-20'),
        vaccineType: 'Typhus',
        comment: 'Annuel',
      },
      {
        petId: mochi.id,
        date: new Date('2024-01-20'),
        vaccineType: 'Coryza',
      },
    ],
  });
  console.log('✅ Vaccinations added');

  // Create past bookings (stays)
  const now = new Date();

  // Stay 1 — Completed boarding (4 months ago)
  const stay1Start = subMonths(now, 4);
  const stay1End = addDays(stay1Start, 5);
  const booking1 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'BOARDING',
      status: 'COMPLETED',
      startDate: stay1Start,
      endDate: stay1End,
      arrivalTime: '10:00',
      notes: 'Max est en bonne santé, pas de régime particulier.',
      totalPrice: 1250,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking1.id, petId: max.id } });
  await prisma.boardingDetail.create({
    data: {
      bookingId: booking1.id,
      includeGrooming: true,
      groomingSize: 'LARGE',
      groomingPrice: 150,
      pricePerNight: 220,
    },
  });

  // Stay 2 — Completed boarding (2.5 months ago)
  const stay2Start = subDays(subMonths(now, 2), 15);
  const stay2End = addDays(stay2Start, 3);
  const booking2 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'BOARDING',
      status: 'COMPLETED',
      startDate: stay2Start,
      endDate: stay2End,
      arrivalTime: '09:00',
      notes: 'Luna et Mochi ensemble. Prévoir des bacs séparés.',
      totalPrice: 980,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking2.id, petId: luna.id } });
  await prisma.bookingPet.create({ data: { bookingId: booking2.id, petId: mochi.id } });
  await prisma.boardingDetail.create({
    data: {
      bookingId: booking2.id,
      includeGrooming: false,
      groomingPrice: 0,
      pricePerNight: 180,
    },
  });

  // Stay 3 — Completed taxi (2 months ago)
  const stay3Date = subMonths(now, 2);
  const booking3 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'PET_TAXI',
      status: 'COMPLETED',
      startDate: stay3Date,
      arrivalTime: '14:30',
      notes: 'Transport Max chez le vétérinaire Dr. Benali.',
      totalPrice: 300,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking3.id, petId: max.id } });
  await prisma.taxiDetail.create({
    data: {
      bookingId: booking3.id,
      taxiType: 'VET',
      price: 300,
    },
  });

  // Stay 4 — Completed boarding (1 month ago)
  const stay4Start = subMonths(now, 1);
  const stay4End = addDays(stay4Start, 7);
  const booking4 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'BOARDING',
      status: 'COMPLETED',
      startDate: stay4Start,
      endDate: stay4End,
      arrivalTime: '11:00',
      notes: 'Max — régime croquettes Hill\'s, 250g matin et soir.',
      totalPrice: 1680,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking4.id, petId: max.id } });
  await prisma.boardingDetail.create({
    data: {
      bookingId: booking4.id,
      includeGrooming: true,
      groomingSize: 'LARGE',
      groomingPrice: 150,
      pricePerNight: 220,
    },
  });

  // Stay 5 — Completed taxi (3 weeks ago)
  const stay5Date = subDays(now, 21);
  const booking5 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'PET_TAXI',
      status: 'COMPLETED',
      startDate: stay5Date,
      arrivalTime: '08:00',
      notes: 'Transfert aéroport Menara. Luna voyage avec Marie.',
      totalPrice: 300,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking5.id, petId: luna.id } });
  await prisma.taxiDetail.create({
    data: {
      bookingId: booking5.id,
      taxiType: 'AIRPORT',
      price: 300,
    },
  });

  // Stay 6 — Upcoming (confirmed, in 2 weeks)
  const stay6Start = addDays(now, 14);
  const stay6End = addDays(stay6Start, 4);
  const booking6 = await prisma.booking.create({
    data: {
      clientId: marie.id,
      serviceType: 'BOARDING',
      status: 'CONFIRMED',
      startDate: stay6Start,
      endDate: stay6End,
      arrivalTime: '10:00',
      notes: 'Max et Luna. Grooming prévu pour les deux.',
      totalPrice: 1190,
    },
  });
  await prisma.bookingPet.create({ data: { bookingId: booking6.id, petId: max.id } });
  await prisma.bookingPet.create({ data: { bookingId: booking6.id, petId: luna.id } });
  await prisma.boardingDetail.create({
    data: {
      bookingId: booking6.id,
      includeGrooming: true,
      groomingSize: 'LARGE',
      groomingPrice: 250,
      pricePerNight: 235,
    },
  });

  console.log('✅ Bookings created (5 past + 1 upcoming)');

  // Create invoices
  let invoiceCounter = 1001;

  const invoice1 = await prisma.invoice.create({
    data: {
      bookingId: booking1.id,
      clientId: marie.id,
      invoiceNumber: `DU-${invoiceCounter++}`,
      amount: 1250,
      status: 'PAID',
      paidAt: addDays(stay1End, 1),
      issuedAt: stay1End,
      notes: 'Pension 5 nuits + Grooming Max',
    },
  });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice1.id, description: 'Pension — 5 nuits (Max)', quantity: 5, unitPrice: 220, total: 1100 },
      { invoiceId: invoice1.id, description: 'Grooming — Grand chien (Max)', quantity: 1, unitPrice: 150, total: 150 },
    ],
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      bookingId: booking2.id,
      clientId: marie.id,
      invoiceNumber: `DU-${invoiceCounter++}`,
      amount: 980,
      status: 'PAID',
      paidAt: addDays(stay2End, 2),
      issuedAt: stay2End,
      notes: 'Pension 3 nuits (Luna + Mochi)',
    },
  });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice2.id, description: 'Pension — 3 nuits (Luna)', quantity: 3, unitPrice: 180, total: 540 },
      { invoiceId: invoice2.id, description: 'Pension — 3 nuits (Mochi)', quantity: 3, unitPrice: 140, total: 420 },
    ],
  });

  const invoice3 = await prisma.invoice.create({
    data: {
      bookingId: booking3.id,
      clientId: marie.id,
      invoiceNumber: `DU-${invoiceCounter++}`,
      amount: 300,
      status: 'PAID',
      paidAt: stay3Date,
      issuedAt: stay3Date,
      notes: 'Pet Taxi — Vétérinaire',
    },
  });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice3.id, description: 'Pet Taxi — Trajet vétérinaire (Max)', quantity: 1, unitPrice: 300, total: 300 },
    ],
  });

  const invoice4 = await prisma.invoice.create({
    data: {
      bookingId: booking4.id,
      clientId: marie.id,
      invoiceNumber: `DU-${invoiceCounter++}`,
      amount: 1680,
      status: 'PENDING',
      issuedAt: stay4End,
      notes: 'Pension 7 nuits + Grooming Max',
    },
  });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice4.id, description: 'Pension — 7 nuits (Max)', quantity: 7, unitPrice: 220, total: 1540 },
      { invoiceId: invoice4.id, description: 'Grooming — Grand chien (Max)', quantity: 1, unitPrice: 150, total: 150 },
    ],
  });

  console.log('✅ Invoices created (3 paid + 1 pending)');

  // Create notifications for Marie
  await prisma.notification.createMany({
    data: [
      {
        userId: marie.id,
        type: 'BOOKING_VALIDATION',
        titleFr: 'Réservation confirmée',
        titleEn: 'Booking confirmed',
        messageFr: `Votre réservation pour Max et Luna du ${stay6Start.toLocaleDateString('fr-FR')} au ${stay6End.toLocaleDateString('fr-FR')} a été confirmée.`,
        messageEn: `Your booking for Max and Luna from ${stay6Start.toLocaleDateString('en-US')} to ${stay6End.toLocaleDateString('en-US')} has been confirmed.`,
        read: false,
        createdAt: subDays(now, 3),
      },
      {
        userId: marie.id,
        type: 'INVOICE_AVAILABLE',
        titleFr: 'Nouvelle facture disponible',
        titleEn: 'New invoice available',
        messageFr: 'Votre facture DU-1004 d\'un montant de 1 680 MAD est disponible.',
        messageEn: 'Your invoice DU-1004 for 1,680 MAD is now available.',
        read: false,
        createdAt: subDays(now, 5),
      },
      {
        userId: marie.id,
        type: 'ADMIN_MESSAGE',
        titleFr: 'Message de Dog Universe',
        titleEn: 'Message from Dog Universe',
        messageFr: 'Bienvenue dans votre espace Dog Universe ! N\'hésitez pas à nous contacter pour toute question.',
        messageEn: 'Welcome to your Dog Universe space! Feel free to contact us for any questions.',
        read: true,
        createdAt: subMonths(now, 3),
      },
      {
        userId: marie.id,
        type: 'LOYALTY_UPDATE',
        titleFr: 'Grade de fidélité mis à jour',
        titleEn: 'Loyalty grade updated',
        messageFr: 'Félicitations ! Vous avez atteint le grade Or. Merci pour votre fidélité.',
        messageEn: 'Congratulations! You have reached Gold grade. Thank you for your loyalty.',
        read: true,
        createdAt: subMonths(now, 2),
      },
    ],
  });
  console.log('✅ Notifications created');

  // Add admin notes
  await prisma.adminNote.create({
    data: {
      entityType: 'CLIENT',
      entityId: marie.id,
      content: 'Cliente très fiable, toujours ponctuelle. Préférence pour les séjours en semaine. Parle français et anglais.',
      createdBy: admin.id,
      createdAt: subMonths(now, 3),
    },
  });
  await prisma.adminNote.create({
    data: {
      entityType: 'PET',
      entityId: max.id,
      content: 'Max est très sociable mais dominant avec les autres mâles. À surveiller. Adore jouer avec la balle. Régime Hill\'s adulte.',
      createdBy: admin.id,
      createdAt: subMonths(now, 2),
    },
  });
  await prisma.adminNote.create({
    data: {
      entityType: 'PET',
      entityId: mochi.id,
      content: 'Mochi est timide au début mais s\'adapte bien. Préférer une cage calme loin des chiens. Nourriture : Royal Canin British Shorthair.',
      createdBy: admin.id,
      createdAt: subMonths(now, 1),
    },
  });
  console.log('✅ Admin notes created');

  // Action logs
  await prisma.actionLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'BOOKING_CONFIRMED',
        entityType: 'BOOKING',
        entityId: booking6.id,
        details: JSON.stringify({ message: 'Réservation confirmée par admin' }),
        createdAt: subDays(now, 3),
      },
      {
        userId: admin.id,
        action: 'INVOICE_CREATED',
        entityType: 'INVOICE',
        entityId: invoice4.id,
        details: JSON.stringify({ amount: 1680, invoiceNumber: 'DU-1004' }),
        createdAt: subDays(now, 5),
      },
      {
        userId: admin.id,
        action: 'LOYALTY_GRADE_SET',
        entityType: 'USER',
        entityId: marie.id,
        details: JSON.stringify({ grade: 'GOLD', previousGrade: 'SILVER' }),
        createdAt: subMonths(now, 2),
      },
    ],
  });
  console.log('✅ Action logs created');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Test accounts:');
  console.log('   Admin:  admin@doguniverse.ma  / Admin2024!');
  console.log('   Client: marie.dupont@email.com / Marie2024!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
