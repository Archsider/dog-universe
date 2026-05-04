-- Add default Dog Universe WhatsApp contact number.
-- Change the value to the real business number before going live.
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('whatsapp_number', '+212600000000', NOW())
ON CONFLICT ("key") DO NOTHING;
