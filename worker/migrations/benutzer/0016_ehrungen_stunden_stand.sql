-- „Stand“ (Jahr) zu manuell nachgetragenen Stunden (worker/src/ehrungen.ts).
--
-- Ein manueller Nachtrag gilt für ein bestimmtes Jahr; ohne diese Angabe ließe sich später nicht
-- beurteilen, wie aktuell die Zahl ist. Der Worker verlangt den Stand bei jedem Nachtrag
-- (`stunden_manuell` ohne `stunden_manuell_stand` wird abgelehnt) und setzt ihn mit dem Nachtrag zurück.
-- Beide Spalten sind nullable, bestehende Zeilen bleiben unverändert.
ALTER TABLE ehrungen_personen ADD COLUMN stunden_manuell_stand INTEGER;

-- Das Änderungsprotokoll hält den Stand des neuen Werts fest (nur bei `stunden-manuell`, sonst NULL).
ALTER TABLE ehrungen_aenderungen ADD COLUMN stand INTEGER;
