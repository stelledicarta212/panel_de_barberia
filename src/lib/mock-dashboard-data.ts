import type { DashboardMerged } from "@/types/dashboard-state";

export const MOCK_MERGED: DashboardMerged = {
  biz_name: "Barbería 58",
  biz_slug: "barberia-58",
  address: "Calle 58 #14-22, Bogotá",
  maps_url: "https://maps.google.com/?q=Calle+58+14-22+Bogota",
  palette_primary: "#d4af37",
  palette_secondary: "#1b2a44",
  palette_accent: "#f59e0b",
  palette_text: "#eef2fb",
  logo_url: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400",
  cover_url: "https://images.unsplash.com/photo-1621607512022-6aecc4fed814?w=1200",
  hero_title: "Experiencia premium para caballeros",
  hero_subtitle: "Reservas rápidas, atención impecable y estilo moderno.",
  template_id: "v7",
  public_landing_url: "https://barberagency-barberagency.gymh5g.easypanel.host/index_unicov7/?slug=barberia-58",
  reservation_url: "https://barberagency-barberagency.gymh5g.easypanel.host/index_unicov7/?slug=barberia-58#reservas",
  qr_url:
    "https://quickchart.io/qr?size=320&margin=2&text=https%3A%2F%2Fbarberagency-barberagency.gymh5g.easypanel.host%2Findex_unicov7%2F%3Fslug%3Dbarberia-58",
  services: [
    { id: 1, nombre: "Corte Clásico", duracion_min: 40, precio: 35000, activo: true },
    { id: 2, nombre: "Fade + Barba", duracion_min: 55, precio: 50000, activo: true },
    { id: 3, nombre: "Afeitado Premium", duracion_min: 35, precio: 30000, activo: true }
  ],
  barbers: [
    { id: 1011, nombre: "Alex M.", rating: 4.9, activo: true },
    { id: 1012, nombre: "James V.", rating: 4.8, activo: true },
    { id: 1013, nombre: "Aldo H.", rating: 4.7, activo: true }
  ],
  hours: [
    { dia: "lunes", activo: true, hora_abre: "09:00", hora_cierra: "19:00" },
    { dia: "martes", activo: true, hora_abre: "09:00", hora_cierra: "19:00" },
    { dia: "miercoles", activo: true, hora_abre: "09:00", hora_cierra: "19:00" },
    { dia: "jueves", activo: true, hora_abre: "09:00", hora_cierra: "19:00" },
    { dia: "viernes", activo: true, hora_abre: "09:00", hora_cierra: "20:00" },
    { dia: "sabado", activo: true, hora_abre: "10:00", hora_cierra: "18:00" }
  ]
};

export const MOCK_CLIENTS = [
  { id: "C-01", nombre: "Carlos R.", visitas: 17, ultima: "2026-04-20", estado: "Frecuente" },
  { id: "C-02", nombre: "Mateo L.", visitas: 11, ultima: "2026-04-19", estado: "Activo" },
  { id: "C-03", nombre: "Juan P.", visitas: 7, ultima: "2026-04-18", estado: "Nuevo" },
  { id: "C-04", nombre: "Luis K.", visitas: 24, ultima: "2026-04-21", estado: "VIP" }
];

export const MOCK_APPOINTMENTS = [
  { id: "A-01", cliente: "Carlos R.", servicio: "Fade + Barba", hora: "10:00", estado: "Confirmada" },
  { id: "A-02", cliente: "Mateo L.", servicio: "Corte Clásico", hora: "11:00", estado: "Pendiente" },
  { id: "A-03", cliente: "Juan P.", servicio: "Afeitado Premium", hora: "12:00", estado: "Confirmada" }
];

export const MOCK_FINANCE = {
  ingresoMensual: 15450,
  costos: 6220,
  margen: 9230,
  ticketPromedio: 42
};

export const MOCK_INVENTORY = [
  { sku: "PR-001", nombre: "Matte Clay", stock: 22, estado: "OK" },
  { sku: "PR-002", nombre: "Aftershave", stock: 9, estado: "Bajo" },
  { sku: "PR-003", nombre: "Shampoo Men", stock: 31, estado: "OK" }
];
