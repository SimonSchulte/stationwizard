-- Entfernt die frühere Nextcloud-Verknüpfung `einsaetze.pep_id` (seit 0021 liegt die PEP in
-- `peps`). Eigene Migration, weil eine bereits laufende ältere Worker-Version die Spalte beim
-- Anlegen eines Einsatzes noch beschreibt: erst einspielen, wenn der Worker mit der PEP in der
-- Datenbank deployt ist. Bis dahin ist die Spalte für den neuen Worker unschädlich (nullable,
-- wird weder gelesen noch geschrieben).
ALTER TABLE einsaetze DROP COLUMN pep_id;
