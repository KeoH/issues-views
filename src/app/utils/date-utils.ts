/**
 * Utilidades de fecha para la planificación multisemanal.
 */

/**
 * Devuelve el lunes (a las 00:00:00) de la semana que contiene a la fecha dada.
 */
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  // El domingo en JS es 0. Lo tratamos como 7 para que el lunes sea 1.
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Añade un número de días a una fecha y devuelve una nueva fecha.
 */
export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Devuelve el número de semana ISO de una fecha dada.
 */
export function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // El jueves determina el año de la semana ISO actual
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  // El primer jueves del año es la semana 1
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
}

/**
 * Devuelve un string legible con el rango de fechas de la semana (Lunes a Viernes).
 * Ejemplo: "15 de Jun - 19 de Jun, 2026"
 */
export function formatDateRange(monday: Date): string {
  const friday = addDays(monday, 4);
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  const startDay = monday.getDate();
  const startMonth = months[monday.getMonth()];
  const endDay = friday.getDate();
  const endMonth = months[friday.getMonth()];
  const year = friday.getFullYear();

  if (monday.getMonth() === friday.getMonth()) {
    return `${startDay} - ${endDay} de ${startMonth}, ${year}`;
  } else {
    return `${startDay} de ${startMonth} - ${endDay} de ${endMonth}, ${year}`;
  }
}

/**
 * Comprueba si dos fechas pertenecen a la misma semana.
 */
export function isSameWeek(d1: Date, d2: Date): boolean {
  const m1 = getMonday(d1);
  const m2 = getMonday(d2);
  return (
    m1.getFullYear() === m2.getFullYear() &&
    m1.getMonth() === m2.getMonth() &&
    m1.getDate() === m2.getDate()
  );
}

/**
 * Devuelve un string en formato ISO local 'YYYY-MM-DDTHH:00:00' para evitar desfases de huso horario (UTC).
 */
export function toLocalISOString(date: Date, hour: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  return `${year}-${month}-${day}T${hourStr}:00:00`;
}
