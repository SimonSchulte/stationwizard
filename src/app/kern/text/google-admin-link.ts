/**
 * Verlinkt die Google Workspace Admin Console für eine E-Mail-Adresse. Setzt
 * voraus, dass die Organisation Google Workspace nutzt und die aufrufende
 * Person selbst dort Admin-Rechte hat – der Link führt sonst zu einer
 * Fehlermeldung bei Google, nicht in dieser App.
 */
export function googleAdminKonsoleLink(email: string): string {
  return `https://admin.google.com/ac/users?query=${encodeURIComponent(`email:${email}`)}`;
}
