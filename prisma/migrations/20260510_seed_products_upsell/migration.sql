-- Seed catalogue Ultra Premium + Canvit (~70 produits) pour upsell smart.
-- Idempotent — `WHERE NOT EXISTS` sur (name, supplier).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "Product" ("id", "name", "brand", "category", "price", "stock", "available", "targetSpecies", "targetAge", "weight", "supplier", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  v.name, v.brand, v.category, v.price, 0, true,
  v."targetSpecies", v."targetAge", v.weight, v.supplier, NOW(), NOW()
FROM (VALUES
  -- ULTRA PREMIUM CHIEN — CROQUETTES
  ('Croquettes chiot petite/moyenne taille 4kg', 'Ultra Premium', 'CROQUETTES', 275, 'DOG', 'PUPPY', '4kg', 'Ultra Premium'),
  ('Croquettes chien adulte petite taille 4kg', 'Ultra Premium', 'CROQUETTES', 275, 'DOG', 'ADULT', '4kg', 'Ultra Premium'),
  ('Croquettes chiot grande taille 4kg', 'Ultra Premium', 'CROQUETTES', 275, 'DOG', 'PUPPY', '4kg', 'Ultra Premium'),
  ('Croquettes chien sensible agneau 4kg', 'Ultra Premium', 'CROQUETTES', 340, 'DOG', 'ADULT', '4kg', 'Ultra Premium'),
  ('Croquettes chien stérilisé petite taille 7kg', 'Ultra Premium', 'CROQUETTES', 430, 'DOG', 'ADULT', '7kg', 'Ultra Premium'),
  ('Croquettes chien adulte petite taille 8kg', 'Ultra Premium', 'CROQUETTES', 450, 'DOG', 'ADULT', '8kg', 'Ultra Premium'),
  ('Croquettes chiot grande taille 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'PUPPY', '12kg', 'Ultra Premium'),
  ('Croquettes chien adulte moyenne 10-30kg 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien adulte grande taille 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien adulte saumon riz 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien sensible agneau riz 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien surpoids/stérilisé 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien mature toutes tailles 12kg', 'Ultra Premium', 'CROQUETTES', 590, 'DOG', 'SENIOR', '12kg', 'Ultra Premium'),
  ('Croquettes chien hypoallergénique poisson 12kg', 'Ultra Premium', 'CROQUETTES', 750, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien senior 7+ ans 12kg', 'Ultra Premium', 'CROQUETTES', 720, 'DOG', 'SENIOR', '12kg', 'Ultra Premium'),
  ('Croquettes original chien adulte 12kg', 'Ultra Premium', 'CROQUETTES', 740, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes light sans céréales chiot 12kg', 'Ultra Premium', 'CROQUETTES', 740, 'DOG', 'PUPPY', '12kg', 'Ultra Premium'),
  ('Croquettes chien sensible toutes tailles 12kg', 'Ultra Premium', 'CROQUETTES', 740, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes light chien stérilisé/surpoids 12kg', 'Ultra Premium', 'CROQUETTES', 740, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chien adulte poulet frais 12kg', 'Ultra Premium', 'CROQUETTES', 750, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chiot poulet frais 12kg', 'Ultra Premium', 'CROQUETTES', 750, 'DOG', 'PUPPY', '12kg', 'Ultra Premium'),
  ('Croquettes chien adulte saumon frais 12kg', 'Ultra Premium', 'CROQUETTES', 800, 'DOG', 'ADULT', '12kg', 'Ultra Premium'),
  ('Croquettes chiot poulet frais 4kg', 'Ultra Premium', 'CROQUETTES', 360, 'DOG', 'PUPPY', '4kg', 'Ultra Premium'),
  ('Croquettes chiot grande taille 15kg', 'Ultra Premium', 'CROQUETTES', 690, 'DOG', 'PUPPY', '15kg', 'Ultra Premium'),
  ('Croquettes chien grande taille 15kg', 'Ultra Premium', 'CROQUETTES', 690, 'DOG', 'ADULT', '15kg', 'Ultra Premium'),
  ('Croquettes saumon frais petite taille 7kg', 'Ultra Premium', 'CROQUETTES', 570, 'DOG', 'ADULT', '7kg', 'Ultra Premium'),
  -- ULTRA PREMIUM CHIEN — FRIANDISES
  ('Terrine poulet/dinde 400g', 'Ultra Premium', 'FRIANDISES', 30, 'DOG', 'ALL', '400g', 'Ultra Premium'),
  ('Terrine agneau 400g', 'Ultra Premium', 'FRIANDISES', 30, 'DOG', 'ALL', '400g', 'Ultra Premium'),
  ('Topper saumon petits pois 70g', 'Ultra Premium', 'FRIANDISES', 11, 'DOG', 'ALL', '70g', 'Ultra Premium'),
  ('Topper poulet carotte thym 70g', 'Ultra Premium', 'FRIANDISES', 11, 'DOG', 'ALL', '70g', 'Ultra Premium'),
  ('Bâtonnets petits/moyens chiens 180g', 'Ultra Premium', 'FRIANDISES', 45, 'DOG', 'ALL', '180g', 'Ultra Premium'),
  ('Bâtonnets grands chiens 220g', 'Ultra Premium', 'FRIANDISES', 49, 'DOG', 'ALL', '220g', 'Ultra Premium'),
  ('Friandises éducation poulet 200g', 'Ultra Premium', 'FRIANDISES', 75, 'DOG', 'PUPPY', '200g', 'Ultra Premium'),
  ('Friandises sensibles agneau riz 150g', 'Ultra Premium', 'FRIANDISES', 65, 'DOG', 'ADULT', '150g', 'Ultra Premium'),
  ('Friandises peau et pelage saumon 150g', 'Ultra Premium', 'FRIANDISES', 65, 'DOG', 'ADULT', '150g', 'Ultra Premium'),
  ('Friandise articulation 80g', 'Ultra Premium', 'FRIANDISES', 100, 'DOG', 'SENIOR', '80g', 'Ultra Premium'),
  ('Biscuits pour chien 400g', 'Ultra Premium', 'FRIANDISES', 85, 'DOG', 'ALL', '400g', 'Ultra Premium'),
  ('Lamelles au poulet 60g', 'Ultra Premium', 'FRIANDISES', 50, 'DOG', 'ALL', '60g', 'Ultra Premium'),
  -- ULTRA PREMIUM HUILE
  ('Huile de saumon 500ml', 'Ultra Premium', 'HUILE', 190, 'BOTH', 'ALL', '500ml', 'Ultra Premium'),
  -- ULTRA PREMIUM CHAT
  ('Croquettes chat intérieur stérilisé 3kg', 'Ultra Premium', 'CROQUETTES', 280, 'CAT', 'ADULT', '3kg', 'Ultra Premium'),
  ('Croquettes chaton sans céréales 3kg', 'Ultra Premium', 'CROQUETTES', 280, 'CAT', 'PUPPY', '3kg', 'Ultra Premium'),
  ('Croquettes chat stérilisé urinaire 5kg', 'Ultra Premium', 'CROQUETTES', 490, 'CAT', 'ADULT', '5kg', 'Ultra Premium'),
  ('Croquettes chat stérilisé saumon 7kg', 'Ultra Premium', 'CROQUETTES', 600, 'CAT', 'ADULT', '7kg', 'Ultra Premium'),
  ('Croquettes chat extérieur 7kg', 'Ultra Premium', 'CROQUETTES', 530, 'CAT', 'ADULT', '7kg', 'Ultra Premium'),
  ('Croquettes chat intérieur stérilisé 7kg', 'Ultra Premium', 'CROQUETTES', 530, 'CAT', 'ADULT', '7kg', 'Ultra Premium'),
  ('Croquettes light chat stérilisé 10kg', 'Ultra Premium', 'CROQUETTES', 670, 'CAT', 'ADULT', '10kg', 'Ultra Premium'),
  ('Mousse poulet sole chat 85g', 'Ultra Premium', 'FRIANDISES', 13, 'CAT', 'ADULT', '85g', 'Ultra Premium'),
  ('Émincés saumon cabillaud 85g', 'Ultra Premium', 'FRIANDISES', 13, 'CAT', 'ALL', '85g', 'Ultra Premium'),
  ('Émincés poulet dinde 85g', 'Ultra Premium', 'FRIANDISES', 13, 'CAT', 'ALL', '85g', 'Ultra Premium'),
  ('Émincé gelée poulet 85g', 'Ultra Premium', 'FRIANDISES', 13, 'CAT', 'ALL', '85g', 'Ultra Premium'),
  ('Mousse light chat stérilisé 85g', 'Ultra Premium', 'FRIANDISES', 13, 'CAT', 'ADULT', '85g', 'Ultra Premium'),
  ('12 boîtes émincés poulet veau 85g', 'Ultra Premium', 'FRIANDISES', 150, 'CAT', 'ALL', '12x85g', 'Ultra Premium'),
  ('Friandise apaisante chat 40g', 'Ultra Premium', 'FRIANDISES', 60, 'CAT', 'ALL', '40g', 'Ultra Premium'),
  ('Friandise croustillante chat 60g', 'Ultra Premium', 'FRIANDISES', 60, 'CAT', 'ALL', '60g', 'Ultra Premium'),
  ('Stick volaille chat 50g', 'Ultra Premium', 'FRIANDISES', 60, 'CAT', 'ALL', '50g', 'Ultra Premium'),
  ('Friandise crémeuse chat 120g', 'Ultra Premium', 'FRIANDISES', 80, 'CAT', 'ALL', '120g', 'Ultra Premium'),
  -- CANVIT CHIEN
  ('Canvit Multi for dogs 100g', 'Canvit', 'COMPLEMENT', 120, 'DOG', 'ALL', '100g', 'Canvit'),
  ('Canvit Junior for dogs 100g', 'Canvit', 'COMPLEMENT', 130, 'DOG', 'PUPPY', '100g', 'Canvit'),
  ('Canvit Junior MAXI 230g', 'Canvit', 'COMPLEMENT', 210, 'DOG', 'PUPPY', '230g', 'Canvit'),
  ('Canvit Senior MAXI 230g', 'Canvit', 'COMPLEMENT', 255, 'DOG', 'SENIOR', '230g', 'Canvit'),
  ('Canvit Biocal Plus 230g', 'Canvit', 'COMPLEMENT', 200, 'DOG', 'PUPPY', '230g', 'Canvit'),
  ('Canvit Biocal Plus MAXI 230g', 'Canvit', 'COMPLEMENT', 225, 'DOG', 'PUPPY', '230g', 'Canvit'),
  ('Canvit Chondro Maxi 230g', 'Canvit', 'COMPLEMENT', 255, 'DOG', 'SENIOR', '230g', 'Canvit'),
  ('Canvit Chondro Super 230g', 'Canvit', 'COMPLEMENT', 360, 'DOG', 'SENIOR', '230g', 'Canvit'),
  ('Canvit Biotin 230g', 'Canvit', 'COMPLEMENT', 185, 'DOG', 'ADULT', '230g', 'Canvit'),
  ('Canvit Biotin Maxi 230g', 'Canvit', 'COMPLEMENT', 185, 'DOG', 'ADULT', '230g', 'Canvit'),
  ('Canvit Immuno 100g', 'Canvit', 'COMPLEMENT', 125, 'DOG', 'ALL', '100g', 'Canvit'),
  ('Canvit Probio 100g', 'Canvit', 'COMPLEMENT', 230, 'DOG', 'ALL', '100g', 'Canvit'),
  ('Canvit Sport 100g', 'Canvit', 'COMPLEMENT', 135, 'DOG', 'ADULT', '100g', 'Canvit'),
  ('Canvit Nutrimin 230g', 'Canvit', 'COMPLEMENT', 135, 'DOG', 'ALL', '230g', 'Canvit'),
  -- CANVIT CHAT
  ('Canvit Multi for cats 100g', 'Canvit', 'COMPLEMENT', 115, 'CAT', 'ALL', '100g', 'Canvit'),
  ('Canvit Biotin for cats 100g', 'Canvit', 'COMPLEMENT', 115, 'CAT', 'ADULT', '100g', 'Canvit'),
  ('Canvit Chondro for cats 100g', 'Canvit', 'COMPLEMENT', 205, 'CAT', 'SENIOR', '100g', 'Canvit'),
  ('Canvit Probio for cats 100g', 'Canvit', 'COMPLEMENT', 230, 'CAT', 'ALL', '100g', 'Canvit'),
  ('Canvit Antistress 230g', 'Canvit', 'COMPLEMENT', 260, 'CAT', 'ALL', '230g', 'Canvit'),
  ('Canvit Immuno Booster cats 30g', 'Canvit', 'COMPLEMENT', 340, 'CAT', 'ALL', '30g', 'Canvit'),
  ('Canvit Nutrimin for cats 150g', 'Canvit', 'COMPLEMENT', 115, 'CAT', 'ALL', '150g', 'Canvit'),
  -- CANVIT CHIEN & CHAT (BOTH)
  ('Canvit BARF Kelp 60g', 'Canvit', 'COMPLEMENT', 95, 'BOTH', 'ALL', '60g', 'Canvit'),
  ('Canvit BARF Collagen & Rosehip 140g', 'Canvit', 'COMPLEMENT', 175, 'BOTH', 'SENIOR', '140g', 'Canvit'),
  ('Canvit BARF Green-Lipped Mussel 180g', 'Canvit', 'COMPLEMENT', 395, 'BOTH', 'SENIOR', '180g', 'Canvit'),
  ('Canvit Amino sol. 250ml', 'Canvit', 'COMPLEMENT', 130, 'BOTH', 'ALL', '250ml', 'Canvit'),
  ('Canvit BARF Silybum Marianum 160g', 'Canvit', 'COMPLEMENT', 165, 'BOTH', 'ADULT', '160g', 'Canvit'),
  ('Canvit BARF Yucca Schidigera 160g', 'Canvit', 'COMPLEMENT', 235, 'BOTH', 'ADULT', '160g', 'Canvit'),
  ('Canvit BARF Brewer''s Yeast 180g', 'Canvit', 'COMPLEMENT', 115, 'BOTH', 'ALL', '180g', 'Canvit'),
  ('Canvit Probio for Dogs and Cats 230g', 'Canvit', 'COMPLEMENT', 370, 'BOTH', 'ALL', '230g', 'Canvit')
) AS v(name, brand, category, price, "targetSpecies", "targetAge", weight, supplier)
WHERE NOT EXISTS (
  SELECT 1 FROM "Product" p
  WHERE p.name = v.name AND COALESCE(p.supplier, '') = COALESCE(v.supplier, '')
);

INSERT INTO "_app_migrations"(name)
VALUES ('20260510_seed_products_upsell')
ON CONFLICT DO NOTHING;
