/** Nutzlast eines gezogenen Helfers; `from…` ist bei einem Helfer aus dem Pool `null`. */
export interface DragData {
  einsatzkraftId: string;
  fromPostenId: string | null;
  fromPositionId: string | null;
}

/** Ziel einer Ablage: genau eine Position eines Postens. */
export interface DropData {
  postenId: string;
  positionId: string;
}
