export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  publicBaseUrl:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "",
  dashboardLoginEndpoint:
    ((process.env.NEXT_PUBLIC_DASHBOARD_LOGIN_ENDPOINT ?? "").startsWith("http")
      ? process.env.NEXT_PUBLIC_DASHBOARD_LOGIN_ENDPOINT
      : "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/login") as string,
  dashboardRecoverRequestEndpoint:
    ((process.env.NEXT_PUBLIC_DASHBOARD_RECOVER_REQUEST_ENDPOINT ?? "").startsWith("http")
      ? process.env.NEXT_PUBLIC_DASHBOARD_RECOVER_REQUEST_ENDPOINT
      : "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/recover/request") as string,
  dashboardRecoverResetEndpoint:
    ((process.env.NEXT_PUBLIC_DASHBOARD_RECOVER_RESET_ENDPOINT ?? "").startsWith("http")
      ? process.env.NEXT_PUBLIC_DASHBOARD_RECOVER_RESET_ENDPOINT
      : "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/recover/reset") as string,
  posSaleEndpoint:
    ((process.env.NEXT_PUBLIC_POS_SALE_ENDPOINT ?? "").startsWith("http")
      ? process.env.NEXT_PUBLIC_POS_SALE_ENDPOINT
      : "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/pos/create-sale") as string,
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
