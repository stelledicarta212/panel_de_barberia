/**
 * Timezone-aware date and range utilities for BarberAgency Loyalty Module.
 * Primary functional timezone: America/Bogota (UTC-5 year-round).
 */

export const BOGOTA_TIMEZONE = "America/Bogota";

export type DateRangePreset = "hoy" | "ayer" | "esta_semana" | "este_mes" | "personalizado";

export interface LoyaltyDateRange {
  preset: DateRangePreset;
  startDate: string; // "YYYY-MM-DD" in Bogota calendar
  endDate: string;   // "YYYY-MM-DD" in Bogota calendar (inclusive end date)
  startIso: string;  // UTC ISO string (>= boundary)
  endIso: string;    // UTC ISO string (< next-day boundary)
  label: string;     // User-facing display, e.g. "Hoy · 29 sep 2026"
}

const SPANISH_MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

export const SPANISH_MONTH_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const DAYS_OF_WEEK_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

export interface CalendarDayCell {
  day: number | null;
  key: string;
  ymd: string | null;
}

/**
 * Builds the cell grid (Monday first, L-D) for a given year and month (0-indexed).
 */
export function buildCalendarDays(year: number, month: number): CalendarDayCell[] {
  const firstDayJs = new Date(year, month, 1).getDay();
  const firstDayMondayIndex = (firstDayJs + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0)).getUTCDate();

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < firstDayMondayIndex; i += 1) {
    cells.push({ day: null, key: `pad-start-${i}`, ymd: null });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    const ymd = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    cells.push({ day: d, key: `d-${ymd}`, ymd });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: `pad-end-${cells.length}`, ymd: null });
  }
  return cells;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Returns { year, month, day } for the given Date in America/Bogota timezone.
 */
export function getBogotaDateParts(d: Date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.format(d).split("-").map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * Returns "YYYY-MM-DD" representing the current calendar date in America/Bogota.
 */
export function getBogotaToday(referenceDate: Date = new Date()): string {
  const { year, month, day } = getBogotaDateParts(referenceDate);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Adds or subtracts days from a "YYYY-MM-DD" string.
 */
export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Converts a Bogota calendar date string "YYYY-MM-DD" to its corresponding UTC ISO string.
 * Bogota is UTC-5 year-round.
 * @param ymd Date string in "YYYY-MM-DD"
 * @param nextDayExclusive If true, returns 00:00:00-05:00 of the following day (< boundary).
 */
export function bogotaYmdToIso(ymd: string, nextDayExclusive = false): string {
  const targetYmd = nextDayExclusive ? addDaysToYmd(ymd, 1) : ymd;
  return new Date(`${targetYmd}T00:00:00-05:00`).toISOString();
}

/**
 * Formats a "YYYY-MM-DD" date string to Spanish short display, e.g. "29 sep 2026".
 */
export function formatBogotaDateDisplay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const monthName = SPANISH_MONTH_SHORT[m - 1] ?? "";
  return `${d} ${monthName} ${y}`;
}

/**
 * Formats a "YYYY-MM-DD" date string without year if same year, e.g. "28 sep".
 */
export function formatBogotaDateShort(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  const monthName = SPANISH_MONTH_SHORT[m - 1] ?? "";
  return `${d} ${monthName}`;
}

/**
 * Computes Monday (start) and Sunday (end) for the week containing the given date in Bogota.
 */
export function getBogotaWeekRange(ymd: string): { mondayYmd: string; sundayYmd: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayYmd = addDaysToYmd(ymd, mondayOffset);
  const sundayYmd = addDaysToYmd(mondayYmd, 6);
  return { mondayYmd, sundayYmd };
}

/**
 * Computes the first and last day of the month for the given date in Bogota.
 */
export function getBogotaMonthRange(ymd: string): { firstDayYmd: string; lastDayYmd: string; monthName: string } {
  const [y, m] = ymd.split("-").map(Number);
  const firstDayYmd = `${y}-${pad2(m)}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
  const lastDayYmd = `${y}-${pad2(m)}-${pad2(daysInMonth)}`;
  const monthName = SPANISH_MONTH_FULL[m - 1] ?? "";
  return { firstDayYmd, lastDayYmd, monthName };
}

/**
 * Computes a complete LoyaltyDateRange object from preset or custom dates.
 */
export function computeDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): LoyaltyDateRange {
  const todayYmd = getBogotaToday(referenceDate);

  switch (preset) {
    case "hoy": {
      return {
        preset: "hoy",
        startDate: todayYmd,
        endDate: todayYmd,
        startIso: bogotaYmdToIso(todayYmd, false),
        endIso: bogotaYmdToIso(todayYmd, true),
        label: `Hoy · ${formatBogotaDateDisplay(todayYmd)}`
      };
    }

    case "ayer": {
      const yesterdayYmd = addDaysToYmd(todayYmd, -1);
      return {
        preset: "ayer",
        startDate: yesterdayYmd,
        endDate: yesterdayYmd,
        startIso: bogotaYmdToIso(yesterdayYmd, false),
        endIso: bogotaYmdToIso(yesterdayYmd, true),
        label: `Ayer · ${formatBogotaDateDisplay(yesterdayYmd)}`
      };
    }

    case "esta_semana": {
      const { mondayYmd, sundayYmd } = getBogotaWeekRange(todayYmd);
      return {
        preset: "esta_semana",
        startDate: mondayYmd,
        endDate: sundayYmd,
        startIso: bogotaYmdToIso(mondayYmd, false),
        endIso: bogotaYmdToIso(sundayYmd, true),
        label: `Esta semana · ${formatBogotaDateShort(mondayYmd)} - ${formatBogotaDateDisplay(sundayYmd)}`
      };
    }

    case "este_mes": {
      const { firstDayYmd, lastDayYmd, monthName } = getBogotaMonthRange(todayYmd);
      const [y] = todayYmd.split("-");
      return {
        preset: "este_mes",
        startDate: firstDayYmd,
        endDate: lastDayYmd,
        startIso: bogotaYmdToIso(firstDayYmd, false),
        endIso: bogotaYmdToIso(lastDayYmd, true),
        label: `Este mes · ${monthName} ${y}`
      };
    }

    case "personalizado": {
      let start = customStart?.trim() || todayYmd;
      let end = customEnd?.trim() || todayYmd;

      // Normalize if start > end
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }

      const label =
        start === end
          ? formatBogotaDateDisplay(start)
          : `${formatBogotaDateDisplay(start)} - ${formatBogotaDateDisplay(end)}`;

      return {
        preset: "personalizado",
        startDate: start,
        endDate: end,
        startIso: bogotaYmdToIso(start, false),
        endIso: bogotaYmdToIso(end, true),
        label
      };
    }

    default:
      return computeDateRange("hoy", undefined, undefined, referenceDate);
  }
}

/**
 * Validates whether a date string falls inside the given LoyaltyDateRange.
 * Uses interval: timestamp >= startIso && timestamp < endIso (half-open [start, end) interval).
 */
export function isDateInRange(
  dateStringOrIso: string | null | undefined,
  range: LoyaltyDateRange
): boolean {
  if (!dateStringOrIso) return false;
  const time = new Date(dateStringOrIso).getTime();
  if (Number.isNaN(time)) return false;

  const startTime = new Date(range.startIso).getTime();
  const endTime = new Date(range.endIso).getTime();

  return time >= startTime && time < endTime;
}

/**
 * Validates query parameters from and to for API handlers.
 * Ensures ISO format and from <= to.
 */
export function validateDateRangeParams(
  fromParam?: string | null,
  toParam?: string | null
): { valid: boolean; startIso?: string; endIso?: string; error?: string } {
  if (!fromParam && !toParam) {
    return { valid: true };
  }

  if (fromParam && !toParam) {
    return { valid: false, error: "El parámetro 'to' es obligatorio cuando se especifica 'from'." };
  }

  if (!fromParam && toParam) {
    return { valid: false, error: "El parámetro 'from' es obligatorio cuando se especifica 'to'." };
  }

  const fromTime = new Date(fromParam!).getTime();
  const toTime = new Date(toParam!).getTime();

  if (Number.isNaN(fromTime)) {
    return { valid: false, error: "Parámetro 'from' no es una fecha u hora ISO válida." };
  }

  if (Number.isNaN(toTime)) {
    return { valid: false, error: "Parámetro 'to' no es una fecha u hora ISO válida." };
  }

  if (fromTime > toTime) {
    return { valid: false, error: "Parámetro 'from' no puede ser posterior a 'to'." };
  }

  return {
    valid: true,
    startIso: new Date(fromTime).toISOString(),
    endIso: new Date(toTime).toISOString()
  };
}
