/**
 * Réparation d'un contrat client dont la génération PDF a échoué en prod.
 *
 * Usage :
 *   npx tsx scripts/repair-contract.ts <clientId>
 *
 * Comportement :
 *   1. Cherche un backup signature dans le bucket privé : contracts/{clientId}-signature.png
 *   2. Si trouvé → régénère le PDF avec generateContractPDF, upload, met à jour
 *      ou crée le ClientContract en DB
 *   3. Si pas de backup → si un ClientContract existe (orphelin), le DELETE
 *      pour permettre au client de re-signer ; sinon log "rien à faire".
 *
 * Variables d'env requises (charger via dotenv ou Vercel CLI) :
 *   DATABASE_URL, DIRECT_URL
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_PRIVATE_STORAGE_BUCKET (optionnel, défaut "uploads-private")
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { generateContractPDF } from '../src/lib/contract-pdf';

async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error('Usage: npx tsx scripts/repair-contract.ts <clientId>');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante.');
    process.exit(1);
  }

  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET ?? 'uploads-private';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const prisma = new PrismaClient();

  try {
    // 1. Lookup client
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, email: true },
    });
    if (!client) {
      console.error(`Client ${clientId} introuvable en DB.`);
      process.exit(1);
    }
    console.log(`Client : ${client.name} (${client.email})`);

    const existing = await prisma.clientContract.findUnique({
      where: { clientId },
    });

    // 2. Tentative de récupération du backup signature
    const signatureKey = `contracts/${clientId}-signature.png`;
    const pdfKey = `contracts/${clientId}.pdf`;

    const { data: sigBlob, error: sigErr } = await supabase.storage
      .from(privateBucket)
      .download(signatureKey);

    if (sigErr || !sigBlob) {
      console.warn(`Aucun backup signature trouvé : ${signatureKey}`);
      console.warn(`  → Erreur Supabase : ${sigErr?.message ?? 'no data'}`);

      if (existing) {
        console.log(`ClientContract orphelin trouvé (id=${existing.id}) — DELETE pour permettre re-signature.`);
        await prisma.clientContract.delete({ where: { clientId } });
        console.log('  ✓ ClientContract supprimé.');
      } else {
        console.log('Aucun ClientContract en DB. Le client peut re-signer normalement.');
      }
      console.log('\nAction requise : demander au client de re-signer le contrat.');
      return;
    }

    console.log(`Backup signature trouvé (${sigBlob.size} bytes), régénération PDF...`);
    const sigBuffer = Buffer.from(await sigBlob.arrayBuffer());
    const signatureDataUrl = `data:image/png;base64,${sigBuffer.toString('base64')}`;

    // 3. Régénération PDF
    const signedAt = existing?.signedAt ?? new Date();
    const ipAddress = existing?.ipAddress ?? undefined;
    const pdfBuffer = await generateContractPDF({
      clientName: client.name,
      clientEmail: client.email,
      signedAt,
      signatureDataUrl,
      ipAddress: ipAddress ?? undefined,
      version: '1.0',
    });
    console.log(`PDF généré (${pdfBuffer.length} bytes), upload...`);

    // 4. Upload PDF
    const { error: uploadErr } = await supabase.storage
      .from(privateBucket)
      .upload(pdfKey, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) {
      console.error(`Upload PDF échoué : ${uploadErr.message}`);
      process.exit(1);
    }
    console.log(`  ✓ PDF uploadé : ${pdfKey}`);

    // 5. Update ou create ClientContract
    if (existing) {
      await prisma.clientContract.update({
        where: { clientId },
        data: { storageKey: pdfKey },
      });
      console.log(`  ✓ ClientContract.storageKey mis à jour.`);
    } else {
      await prisma.clientContract.create({
        data: {
          clientId,
          signedAt,
          storageKey: pdfKey,
          ipAddress,
          version: '1.0',
        },
      });
      console.log(`  ✓ ClientContract créé.`);
    }

    console.log('\n✅ Réparation terminée. Le client peut accéder à son contrat.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
