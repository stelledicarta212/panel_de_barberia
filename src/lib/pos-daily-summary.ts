export type PosDailyMovement = {
  id: string;
  status: "Pendiente" | "Aceptada";
  rawEstado: string;
  method: string;
  amount: number;
};

function isSourceAppointment(movement: PosDailyMovement): boolean {
  return movement.id.startsWith("cita-") || !Number.isNaN(Number(movement.id));
}

export function summarizePosDay<T extends PosDailyMovement>(movements: T[]) {
  const noShows = movements.filter(
    (movement) => isSourceAppointment(movement) && movement.rawEstado === "no_asistio"
  );
  const cancelled = movements.filter(
    (movement) => isSourceAppointment(movement) && movement.rawEstado === "cancelada"
  );
  const excludedIds = new Set([...noShows, ...cancelled].map((movement) => movement.id));
  const paid = movements.filter(
    (movement) => movement.status !== "Pendiente" && !excludedIds.has(movement.id)
  );
  const pending = movements.filter((movement) => {
    const eligibleState = ["confirmada", "en_servicio", "realizada"].includes(movement.rawEstado);
    return movement.status === "Pendiente" && eligibleState && isSourceAppointment(movement);
  });
  const sales = paid.reduce((total, movement) => total + movement.amount, 0);
  const cash = paid
    .filter((movement) => movement.method.toLowerCase() === "efectivo")
    .reduce((total, movement) => total + movement.amount, 0);
  const digital = paid
    .filter((movement) => movement.method.toLowerCase() !== "efectivo")
    .reduce((total, movement) => total + movement.amount, 0);

  return {
    paid,
    pending,
    noShows,
    cancelled,
    scheduledCount: movements.length,
    scheduledAmount: movements.reduce((total, movement) => total + movement.amount, 0),
    pendingAmount: pending.reduce((total, movement) => total + movement.amount, 0),
    sales,
    cash,
    digital,
    net: sales
  };
}
