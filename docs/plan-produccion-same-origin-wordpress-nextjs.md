# Plan de Producción: Same-Origin Routing para WordPress y Next.js

* **Fecha de Diseño:** 2026-06-16
* **Estatus:** **DISEÑO DE ARQUITECTURA COMPLETADO**
* **Severidad Asociada:** **CRÍTICA (Resuelve el bloqueo P0 de hidratación y publicación)**
* **Decisión de Negocio / Guardrail:** **Backend n8n, PostgreSQL, PostgREST y workflows se mantienen intactos.**

---

## 1. Arquitectura Actual y Problema

### 1.1. Arquitectura de Dos Dominios (Cross-Origin)
Actualmente, los servicios se dividen en dos subdominios independientes en EasyPanel:
* **WordPress (Frontend/Onboarding/Editor):**
  `https://barberagency-barberagency.gymh5g.easypanel.host`
* **Next.js (Dashboard Private Panel / API Proxies):**
  `https://barberagency-app.gymh5g.easypanel.host`

### 1.2. El Problema (Lax Cookie en Contexto de Terceros)
1. El usuario se registra o inicia sesión en WordPress. La cookie `ba_session` (JWT HttpOnly, Secure, SameSite=Lax) se asocia al dominio Next.js.
2. Al cargar el asistente de configuración (`registrobarberia.html` en el dominio de WordPress), el cliente hace una petición AJAX (`fetch`) a:
   `https://barberagency-app.gymh5g.easypanel.host/api/dashboard/state`
3. Al ser dominios (subdominios) distintos, los navegadores modernos clasifican esta petición como **cross-site**.
4. Dado que la cookie `ba_session` tiene `SameSite=Lax`, el navegador **bloquea la cookie**, impidiendo que viaje en el fetch.
5. El proxy Next.js no detecta la cookie de sesión y responde con **HTTP 401 Unauthorized**.
6. La hidratación del onboarding y el editor de landing fallan por completo (se generan colecciones vacías `[]`).

---

## 2. Arquitectura Objetivo: Same-Origin Routing

Para eliminar CORS, evitar la necesidad de configurar `SameSite=None` y asegurar que la cookie viaje nativamente, unificaremos ambos servicios bajo un **único dominio** utilizando enrutamiento por rutas en el proxy/ingress (reverse proxy) de EasyPanel/Nginx.

### 2.1. Diagrama de Flujo del Ingress/Routing
```
                                        [ Dominio Único ]
                  https://barberagency-barberagency.gymh5g.easypanel.host
                                               |
                                     ( Nginx Reverse Proxy )
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
             [ Coincide con Ruta API / Panel ]                   [ Cualquier otra ruta ]
           /api/*, /_next/*, /barberia/*, etc.                    (WordPress Landings)
                     |                                                   |
                     v                                                   v
           [ Next.js Container ]                              [ WordPress Container ]
              (Puerto 3000)                                       (Puerto 80)
```

### 2.2. Tabla de Enrutamiento de Rutas en Producción

El reverse proxy (Nginx de EasyPanel) se configurará para escuchar en el dominio principal y direccionar el tráfico de la siguiente manera:

| Ruta | Servicio Destino (Upstream) | Puerto Interno | Propósito |
| :--- | :--- | :--- | :--- |
| `/api/*` | Next.js Panel App | `3000` | Rutas API proxies para sesión, estado y editor |
| `/_next/*` | Next.js Panel App | `3000` | Archivos estáticos y de compilación de Next.js |
| `/barberia/*` | Next.js Panel App | `3000` | Dashboard principal |
| `/citas/*` | Next.js Panel App | `3000` | Módulo de reservas del dashboard |
| `/barberos/*` | Next.js Panel App | `3000` | Módulo de personal/barberos |
| `/servicios/*` | Next.js Panel App | `3000` | Módulo de servicios de barbería |
| `/inventario/*` | Next.js Panel App | `3000` | Módulo POS / Caja |
| `/finanzas/*` | Next.js Panel App | `3000` | Programa de lealtad / finanzas |
| `/configuracion/*` | Next.js Panel App | `3000` | Ajustes de barbería |
| `/wp-admin/*` | WordPress | `80` | Panel de WordPress |
| `/wp-content/*` | WordPress | `80` | Assets y plugins de WordPress |
| `/wp-includes/*` | WordPress | `80` | Dependencias JavaScript/CSS de WordPress |
| `/wp-json/*` | WordPress | `80` | API interna de WordPress |
| `/registro-barberias/*`| WordPress | `80` | Template del onboarding wizard |
| `/*` (Fallback) | WordPress | `80` | Landings públicas y página de inicio |

---

## 3. Cambios Mínimos Requeridos en Código

### 3.1. En `barberagency-core`
1. **Remoción de URLs absolutas hardcodeadas:** Cambiar la variable global `window.BA_PANEL_API_BASE_URL` en `registrobarberia.html` y el Editor para que por defecto sea una cadena vacía (`""`), obligando a usar rutas relativas same-origin en producción.
2. **Construcción de URL de estado relativa:**
   ```javascript
   const PANEL_API_BASE = (window.BA_PANEL_API_BASE_URL || "").replace(/\/+$/, "");
   const stateUrl = `${PANEL_API_BASE}/api/dashboard/state?barberia_id=${encodeURIComponent(identity.barberia_id)}&slug=${encodeURIComponent(identity.slug)}`;
   ```

### 3.2. En `panel_de_barberia`
No se requieren cambios de código funcionales en Next.js. El proxy ya resuelve de forma relativa si se le llama same-origin. 
* Se debe configurar `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_BASE_URL` a:
  `https://barberagency-barberagency.gymh5g.easypanel.host`

---

## 4. Variables de Entorno Afectadas

Para el contenedor Next.js (`panel_de_barberia`), se deben definir/actualizar en EasyPanel:
* `NEXT_PUBLIC_APP_URL` = `https://barberagency-barberagency.gymh5g.easypanel.host`
* `NEXT_PUBLIC_BASE_URL` = `https://barberagency-barberagency.gymh5g.easypanel.host`

---

## 5. Plan de Implementación (Paso a Paso)

### Fase 1: Modificación de código (Desarrollo)
1. Aplicar cambios a `registrobarberia.html` para usar URLs relativas.
2. Aplicar cambios a `landing_editor_v2_unico_vscode.html` para usar URLs relativas.
3. Compilar localmente `panel_de_barberia` (`npm run build`) para certificar que el frontend Next.js no tiene referencias absolutas rotas.

### Fase 2: Configuración del Reverse Proxy en EasyPanel (Ingress)
1. En el servicio de WordPress (`barberagency-barberagency`):
2. Añadir directivas personalizadas de Nginx para redirigir los paths del panel Next.js (`/api/`, `/_next/`, `/barberia/`, etc.) al contenedor upstream de Next.js (`barberagency-app` en el puerto `3000`):
   ```nginx
   location ~ ^/(api|_next|barberia|citas|barberos|servicios|inventario|finanzas|configuracion)(/.*)?$ {
       proxy_pass http://barberagency-app:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
3. Reiniciar el proxy de EasyPanel.

### Fase 3: Despliegue en Entorno de QA (WordPress)
1. Duplicar la página `/registro-barberias/` a `/registro-barberias-qa/` en WordPress.
2. Pegar el HTML de `registrobarberia.html` modificado en la página QA.
3. Probar el flujo completo en `/registro-barberias-qa/`.

### Fase 4: Despliegue Real en Producción
1. Reemplazar el código de `/registro-barberias/` con el HTML QA validado.

---

## 6. Plan de Rollback

Si el reverse proxy causa fallos de enrutamiento en WordPress o caídas en cascada:
1. Revertir las reglas de Nginx en EasyPanel para eliminar el redireccionamiento de `/api` and `/barberia`.
2. Restaurar la variable `window.BA_PANEL_API_BASE_URL` en WordPress configurando el valor absoluto anterior de Next.js (`https://barberagency-app.gymh5g.easypanel.host`) en la cabecera del script de WordPress (inyección local de cabecera) para forzar el fallback anterior sin tocar el archivo HTML del repositorio.

---

## 7. Riesgos y Mitigación

* **Colisión de Rutas:** WordPress podría tener URLs públicas que inicien con `/api` o `/barberia`. 
  - *Mitigación:* Se verificó que WordPress no usa estas rutas para páginas comerciales. Las URLs públicas de landings se sirven bajo el path `/b/*` (`/b/slug`).
* **Compilación de Next.js en Producción:** Cualquier assets de compilación no mapeado bajo `/_next` podría romperse.
  - *Mitigación:* Se mapea la ruta completa `/_next/*` para asegurar que carguen los bundles de webpack/next.
