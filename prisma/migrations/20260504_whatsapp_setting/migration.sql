-- Add default Dog Universe WhatsApp contact number.
-- Change the value to the real business number before going live.
INSERT INTO "Setting" ("key", "value")
VALUES ('whatsapp_number', '+212600000000')
ON CONFLICT ("key") DO NOTHING;
