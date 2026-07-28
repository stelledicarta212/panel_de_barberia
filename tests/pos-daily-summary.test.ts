import { describe, expect, it } from "vitest";
import { summarizePosDay } from "../src/lib/pos-daily-summary";

const movements = [
  { id: "1", status: "Aceptada" as const, rawEstado: "pagada", method: "Efectivo", amount: 30000 },
  { id: "2", status: "Pendiente" as const, rawEstado: "confirmada", method: "Pendiente", amount: 20000 },
  { id: "3", status: "Pendiente" as const, rawEstado: "no_asistio", method: "Pendiente", amount: 25000 },
  { id: "4", status: "Pendiente" as const, rawEstado: "cancelada", method: "Pendiente", amount: 15000 }
];

describe("summarizePosDay", () => {
  it("desglosa no asistencias y cancelaciones sin sumarlas a caja", () => {
    const summary = summarizePosDay(movements);

    expect(summary.scheduledCount).toBe(4);
    expect(summary.scheduledAmount).toBe(90000);
    expect(summary.paid.map((item) => item.id)).toEqual(["1"]);
    expect(summary.pending.map((item) => item.id)).toEqual(["2"]);
    expect(summary.noShows.map((item) => item.id)).toEqual(["3"]);
    expect(summary.cancelled.map((item) => item.id)).toEqual(["4"]);
    expect(summary.sales).toBe(30000);
    expect(summary.cash).toBe(30000);
    expect(summary.digital).toBe(0);
    expect(summary.pendingAmount).toBe(20000);
    expect(summary.net).toBe(30000);
  });

  it("ignora en caja un no_asistio aunque llegue marcado como aceptado", () => {
    const summary = summarizePosDay([
      { id: "9", status: "Aceptada", rawEstado: "no_asistio", method: "Efectivo", amount: 40000 }
    ]);

    expect(summary.paid).toHaveLength(0);
    expect(summary.cash).toBe(0);
    expect(summary.digital).toBe(0);
    expect(summary.net).toBe(0);
  });

  it.each(["no_asistio", "cancelada"])(
    "reclasifica dinámicamente una cita confirmada como %s sin alterar el neto",
    (nextState) => {
      const paid = movements[0];
      const confirmed = movements[1];
      const before = summarizePosDay([paid, confirmed]);
      const after = summarizePosDay([paid, { ...confirmed, rawEstado: nextState }]);

      expect(before.pending.map((item) => item.id)).toContain("2");
      expect(after.pending.map((item) => item.id)).not.toContain("2");
      expect(
        nextState === "no_asistio" ? after.noShows : after.cancelled
      ).toHaveLength(1);
      expect(after.net).toBe(before.net);
      expect(after.cash).toBe(before.cash);
      expect(after.digital).toBe(before.digital);
    }
  );
});
