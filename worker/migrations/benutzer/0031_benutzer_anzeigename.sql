-- Selbst gewählter Anzeigename je Person (Benutzereinstellungen).
--
-- NULL heißt: kein eigener Name, die Oberfläche und der Worker leiten einen lesbaren Namen aus
-- der geprüften E-Mail-Adresse ab. Ein gesetzter Wert überschreibt ihn für alle Ausgaben
-- (Unterschrift, Versandtexte, Verlaufseinträge) und die Anzeige von Logeinträgen. Die E-Mail-
-- Adresse bleibt der Schlüssel jeder Zuordnung (Rollen, Unterschriften, Freigaben); der Name ist
-- reine Darstellung und wird ausschließlich von der Person selbst gesetzt (siehe
-- worker/src/anzeigename.ts).
ALTER TABLE benutzer ADD COLUMN anzeigename TEXT;
