export type OffPeakRule = {
  id: number;
  barberia_id: number;
  nombre: string | null;
  dias_semana: number[]; // 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
  hora_inicio: string; // "HH:MM" or "HH:MM:SS"
  hora_fin: string; // "HH:MM" or "HH:MM:SS"
  descuento_porcentaje: number; // 1 <= pct < 100
  aplica_todos_servicios: boolean;
  servicios_ids: number[] | null;
  aplica_todos_barberos: boolean;
  barberos_ids: number[] | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
};

export type OffPeakRuleInput = {
  barberia_id?: number;
  nombre?: string | null;
  dias_semana: number[];
  hora_inicio: string;
  hora_fin: string;
  descuento_porcentaje: number;
  aplica_todos_servicios?: boolean;
  servicios_ids?: number[] | null;
  aplica_todos_barberos?: boolean;
  barberos_ids?: number[] | null;
  activo?: boolean;
};

export type OffPeakPriceCalculation = {
  ok: boolean;
  precio_base: number;
  descuento_porcentaje: number;
  descuento_valor: number;
  precio_final: number;
  tiene_descuento: boolean;
  promocion_id: number | null;
  promocion_nombre: string | null;
  promocion_snapshot: {
    id: number;
    nombre: string | null;
    descuento_porcentaje: number;
    descuento_valor: number;
    hora_inicio: string;
    hora_fin: string;
    dias_semana: number[];
  } | null;
};
