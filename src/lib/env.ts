export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  publicBaseUrl:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "",
  dashboardStateEndpoint:
    process.env.NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT ??
    "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/state",
  draftSaveEndpoint:
    process.env.NEXT_PUBLIC_DRAFT_SAVE_ENDPOINT ??
    "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/landing/draft/save",
  publishEndpoint:
    process.env.NEXT_PUBLIC_PUBLISH_ENDPOINT ??
    "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/landing/save-v2",
  publishRpcEndpoint:
    process.env.NEXT_PUBLIC_PUBLISH_RPC_ENDPOINT ??
    "/rpc/ba_publicar_barberia",
  resolveQrRpcEndpoint:
    process.env.NEXT_PUBLIC_RESOLVE_QR_RPC_ENDPOINT ??
    "/rpc/ba_resolver_qr",
  publicLandingRpcEndpoint:
    process.env.NEXT_PUBLIC_PUBLIC_LANDING_RPC_ENDPOINT ??
    "/rpc/ba_get_landing_publica",
  disableRemoteFetch:
    (process.env.NEXT_PUBLIC_DISABLE_REMOTE_FETCH ?? "0").trim() === "1",
  testBarberiaSlug: process.env.NEXT_PUBLIC_TEST_BARBERIA_SLUG ?? "",
  testBarberiaId: process.env.NEXT_PUBLIC_TEST_BARBERIA_ID ?? ""
};

export function assertEnv() {
  if (!env.apiBaseUrl) {
    throw new Error("Falta NEXT_PUBLIC_API_BASE_URL en .env.local");
  }
}
