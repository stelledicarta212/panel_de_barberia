import { describe, expect, it } from "vitest";
import { getPosAppointmentAction } from "../src/lib/pos-appointment-flow";

describe("getPosAppointmentAction", () => {
  it.each([
    ["confirmada", "Confirmada", "Iniciar servicio", "en_servicio"],
    ["en_servicio", "En servicio", "Finalizar servicio", "realizada"],
    ["realizada", "Realizada", "Cargar al POS", null]
  ])("resuelve la acción POS para %s", (state, badge, button, nextState) => {
    expect(getPosAppointmentAction(state)).toEqual({ badge, button, nextState });
  });

  it("no ofrece acciones para estados fuera del flujo autorizado", () => {
    expect(getPosAppointmentAction("pendiente")).toBeNull();
    expect(getPosAppointmentAction("pagada")).toBeNull();
  });
});
