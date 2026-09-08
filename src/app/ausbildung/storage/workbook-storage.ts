/**
 * Excel bleibt das führende Format der Ausbildungsplanung. Der Speichervertrag
 * ist unabhängig vom Dateiformat und wird mit der Einsatzplanung geteilt.
 */
export {
  type DateiInhalt as WorkbookInhalt,
  type DateiStorage as WorkbookStorage,
  type StorageArt,
  type StorageFaehigkeiten,
  StorageFehler,
} from '../../kern/storage/datei-storage';
