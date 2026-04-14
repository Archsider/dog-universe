import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const payments = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: new Date('2026-04-01'), lte: new Date('2026-04-30') }
    },
    include: {
      invoice: {
        include: {
          booking: { select: { serviceType: true } },
          items: { select: { description: true, unitPrice: true, quantity: true } }
        }
      }
    }
  })

  for (const p of payments) {
    console.log(JSON.stringify({
      amount: p.amount,
      serviceType: p.invoice.booking?.serviceType ?? 'NO_BOOKING',
      items: p.invoice.items.map(i => ({ desc: i.description, price: i.unitPrice, qty: i.quantity }))
    }, null, 2))
  }

  await prisma.$disconnect()
}

main()
