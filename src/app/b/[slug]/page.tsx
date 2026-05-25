import { getLandingPublicaBySlug } from "@/lib/public-rpc";

type LandingPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicLandingPage({ params }: LandingPageProps) {
  const { slug } = await params;
  const safeSlug = String(slug || "").trim();

  if (!safeSlug) {
    return (
      <main style={{ maxWidth: 860, margin: "40px auto", padding: "0 16px" }}>
        <h1>Landing no disponible</h1>
        <p>No se encontró el slug solicitado.</p>
      </main>
    );
  }

  let payload: Awaited<ReturnType<typeof getLandingPublicaBySlug>> | null = null;
  try {
    payload = await getLandingPublicaBySlug(safeSlug);
  } catch {
    payload = null;
  }

  const ok = payload?.ok === true && payload.barberia;
  if (!ok) {
    return (
      <main style={{ maxWidth: 860, margin: "40px auto", padding: "0 16px" }}>
        <h1>Landing no disponible</h1>
        <p>Esta barbería no está publicada o no existe.</p>
      </main>
    );
  }

  const safePayload = payload!;
  const services = Array.isArray(safePayload.servicios) ? safePayload.servicios : [];
  const barbers = Array.isArray(safePayload.barberos) ? safePayload.barberos : [];

  return (
    <main style={{ maxWidth: 980, margin: "28px auto", padding: "0 16px 48px" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 6 }}>{safePayload.barberia?.nombre || "Barbería"}</h1>
        <small>Slug: {safePayload.barberia?.slug || safeSlug}</small>
      </header>

      <section style={{ marginBottom: 24 }}>
        <h2>Servicios activos</h2>
        {services.length ? (
          <ul>
            {services.map((service, idx) => (
              <li key={`${service.id ?? idx}-${service.nombre ?? "servicio"}`}>
                <strong>{service.nombre || "Servicio"}</strong>
                {" · "}
                {Number(service.duracion_min || 0)} min
                {" · "}
                ${Number(service.precio || 0)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay servicios activos.</p>
        )}
      </section>

      <section>
        <h2>Barberos activos</h2>
        {barbers.length ? (
          <ul>
            {barbers.map((barber, idx) => (
              <li key={`${barber.id ?? idx}-${barber.nombre ?? "barbero"}`}>{barber.nombre || "Barbero"}</li>
            ))}
          </ul>
        ) : (
          <p>No hay barberos activos.</p>
        )}
      </section>
    </main>
  );
}
