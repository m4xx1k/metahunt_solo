-- Custom SQL migration file, put your code below! --
-- `vacancies.unique_vacancy_id` and `unique_vacancies.canonical_vacancy_id`
-- form an intentional creation cycle. Deferring both constraints lets the
-- loader insert a preallocated vacancy/group UUID pair atomically. This is
-- additive in behaviour: nullable membership remains until the following
-- deploy has completed a production ingest cycle.
ALTER TABLE vacancies
  DROP CONSTRAINT "vacancies_unique_vacancy_id_unique_vacancies_id_fk";--> statement-breakpoint
ALTER TABLE unique_vacancies
  DROP CONSTRAINT "unique_vacancies_canonical_vacancy_id_vacancies_id_fk";--> statement-breakpoint
ALTER TABLE unique_vacancies
  DROP CONSTRAINT "unique_vacancies_representative_vacancy_id_vacancies_id_fk";--> statement-breakpoint

ALTER TABLE vacancies
  ADD CONSTRAINT "vacancies_unique_vacancy_id_unique_vacancies_id_fk"
  FOREIGN KEY (unique_vacancy_id) REFERENCES unique_vacancies(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE unique_vacancies
  ADD CONSTRAINT "unique_vacancies_canonical_vacancy_id_vacancies_id_fk"
  FOREIGN KEY (canonical_vacancy_id) REFERENCES vacancies(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE unique_vacancies
  ADD CONSTRAINT "unique_vacancies_representative_vacancy_id_vacancies_id_fk"
  FOREIGN KEY (representative_vacancy_id) REFERENCES vacancies(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
