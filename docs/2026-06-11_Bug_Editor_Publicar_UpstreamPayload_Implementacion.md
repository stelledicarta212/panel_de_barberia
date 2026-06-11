# Bug editor publicar - payload upstream normalizado

Fecha: 2026-06-11

## Contexto

Despues del fix `e5ccc0ae411389a1d74c3d1933a581f3c74713f1`, el proxy
`/api/editor/publish` ya valida correctamente `barberia_id` y `slug` desde
body raiz o desde `p_payload`.

El error productivo cambio de `barberia_id requerido` a:

```txt
No se pudo publicar: No se encontro barberia
```

## Causa raiz

`src/app/api/editor/publish/route.ts` validaba tenant contra `ba_session`,
`barberia_id` y `slug`, pero despues reenviaba al upstream de publicacion el
`rawBody` original.

Cuando el frontend enviaba la identidad dentro de:

```json
{
  "p_payload": {
    "barberia_id": 198,
    "slug": "barberia-prueba-4"
  }
}
```

el upstream podia no encontrar la barberia si esperaba `barberia_id` o `slug`
en raiz.

## Implementacion

Se agrego `normalizePublishPayloadForUpstream()` en:

```txt
src/app/api/editor/publish/route.ts
```

El proxy ahora:

1. Lee y parsea el body.
2. Valida tenant con `validateEditorTenant()`.
3. Solo si la validacion es correcta, normaliza el payload hacia upstream.
4. Envia `barberia_id`, `p_barberia_id`, `id_barberia`, `slug` y `biz_slug`
   en raiz y dentro de `p_payload`.

La identidad enviada al upstream sale de:

```txt
tenant.barberiaId
tenant.slug
```

No sale de valores sin validar del frontend.

## Seguridad

No se relajan permisos.

- No se confia en query params.
- No se confia en localStorage.
- No se confia en admin_email.
- `ba_session` sigue siendo obligatoria.
- `validateEditorTenant()` sigue bloqueando barberia ajena.
- `validateEditorTenant()` sigue bloqueando slug mismatch.
- El payload manipulado queda sobrescrito por el tenant validado.

## Pruebas agregadas

Archivo:

```txt
tests/editor-publish.test.ts
```

Casos cubiertos:

- payload anidado en `p_payload` se promueve a raiz.
- `p_payload` se conserva.
- `tenant.barberiaId` gana sobre valores manipulados del frontend.
- `tenant.slug` gana sobre slug manipulado.
- raiz y `p_payload` reciben identidad validada.

## Alcance no tocado

- DB: no tocada.
- n8n: no tocado.
- EasyPanel: no tocado.
- WordPress: no tocado.
- POS: no tocado.
- Reservas: no tocadas.
- `/api/configuracion/update`: no tocado.

## Deploy

Requiere redeploy de EasyPanel para activar el nuevo proxy.

## Decision

BUG PUBLICAR EDITOR - UPSTREAM PAYLOAD IMPLEMENTADO
