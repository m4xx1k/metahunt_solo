-- Custom SQL migration file, put your code below! --
ALTER TABLE vacancies
  DROP CONSTRAINT "vacancies_unique_vacancy_id_unique_vacancies_id_fk";--> statement-breakpoint
ALTER TABLE vacancies
  ALTER COLUMN unique_vacancy_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE vacancies
  ADD CONSTRAINT "vacancies_unique_vacancy_id_unique_vacancies_id_fk"
  FOREIGN KEY (unique_vacancy_id) REFERENCES unique_vacancies(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
