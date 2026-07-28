export type PosAppointmentAction = {
  badge: "Confirmada" | "En servicio" | "Realizada";
  button: "Iniciar servicio" | "Finalizar servicio" | "Cargar al POS";
  nextState: "en_servicio" | "realizada" | null;
};

export function getPosAppointmentAction(rawState: string): PosAppointmentAction | null {
  switch (rawState.trim().toLowerCase()) {
    case "confirmada":
      return { badge: "Confirmada", button: "Iniciar servicio", nextState: "en_servicio" };
    case "en_servicio":
      return { badge: "En servicio", button: "Finalizar servicio", nextState: "realizada" };
    case "realizada":
      return { badge: "Realizada", button: "Cargar al POS", nextState: null };
    default:
      return null;
  }
}
