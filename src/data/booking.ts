export const booking = {
  /** URL "/exec" de la aplicación web de Google Apps Script (ver apps-script/README.md). */
  apiUrl:
    "https://script.google.com/macros/s/AKfycbz40sgA546SzVgeRYx3wB9Y08UFkePxyhXauYN6mm4fuTM9LrsoNuRZBI2PEhsFKwb7uQ/exec",
  /** Primera hora de inicio de sesión (24h). */
  startHour: 10,
  /** Hora de cierre: la última sesión empieza una hora antes. */
  endHour: 18,
  /** Días laborables (0 = domingo … 6 = sábado). */
  workDays: [1, 2, 3, 4, 5],
  /** Cuántos días hacia adelante se pueden reservar. */
  daysAhead: 90,
  /** Primer día reservable (1 = a partir de mañana). */
  minNoticeDays: 1,
  /** Fracción aproximada de huecos que se muestran como ocupados (0–1). */
  busyRatio: 0.45,
};

export type BookingConfig = typeof booking;
