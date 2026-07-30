ALTER TABLE "subscriptions" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "subscriptions"
SET "name" =
  (ARRAY['Cosmic', 'Electric', 'Midnight', 'Neon', 'Quantum', 'Turbo', 'Velvet', 'Wild'])[1 + get_byte(uuid_send("id"), 0) % 8]
  || ' '
  || (ARRAY['Badger', 'Capybara', 'Falcon', 'Gecko', 'Otter', 'Panda', 'Raccoon', 'Walrus'])[1 + get_byte(uuid_send("id"), 1) % 8]
  || ' #'
  || upper(substr(replace("id"::text, '-', ''), 1, 6))
WHERE "name" IS NULL;
