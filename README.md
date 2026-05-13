# BarberAgency Dashboard

Dashboard nuevo en carpeta separada (`apps/dashboard`) con:

- Next.js 16.2.4 (App Router + `src/app`)
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4 + `@tailwindcss/postcss`
- ESLint 9 + `eslint-config-next`
- `lucide-react`

## Ejecutar

```bash
cd apps/dashboard
npm install
npm run dev
```

## Variables de entorno

Copia `.env.local.example` a `.env.local` y ajusta:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT`
- `NEXT_PUBLIC_DRAFT_SAVE_ENDPOINT`
- `NEXT_PUBLIC_PUBLISH_ENDPOINT`
