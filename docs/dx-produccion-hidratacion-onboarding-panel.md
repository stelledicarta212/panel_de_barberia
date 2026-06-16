# Reporte de Auditoría de Producción y DX: Fallo de Hidratación en Onboarding y Editor hacia el Panel

* **Fecha de Pruebas:** 2026-06-16T02:18:11Z
* **Auditor/Arquitecto Senior:** Antigravity (Advanced Agentic Coding Team, Google DeepMind)
* **Estatus de Diagnóstico:** **IDENTIFICADO (CAUSA RAÍZ ENCONTRADA)**
* **Severidad:** **CRÍTICA (P0 - Bloquea la carga del editor y corrompe semillas de publicación)**

---

## 1. Resumen Ejecutivo

Durante el onboarding y el editor, los datos reales de la barbería (servicios, barberos, horarios) no se están cargando (hidratando) en los componentes visuales. Como resultado, cuando el usuario avanza al editor de landing, se inicializa una semilla vacía (`servicios: []`, `barberos: []`, `horarios: []`) y el panel posterior queda en blanco o sin datos comerciales.

**Diagnóstico Técnico:**
1. El HTML de registro (`registrobarberia.html`) y las llamadas API locales de Next.js están **correctamente implementados y actualizados** en el repositorio y desplegados en producción.
2. Los contratos JSON devueltos por el backend en n8n (`Respond - ok` en el workflow `6JugRzxsOGKBvgWW`) y Next.js son **100% compatibles** con lo que espera el frontend.
3. El fallo reside enteramente en una **incompatibilidad de seguridad cross-origin del navegador**:
   - El onboarding y editor corren en el dominio de WordPress: `https://barberagency-barberagency.gymh5g.easypanel.host`
   - El estado del panel y del editor se consulta en el dominio de la App (Next.js): `https://barberagency-app.gymh5g.easypanel.host`
   - La cookie de sesión `ba_session` tiene directiva `SameSite=Lax`.
   - Cuando el código AJAX en el dominio de WordPress hace un `fetch` hacia el dominio de la App con `credentials: "include"`, el navegador **omite enviar la cookie de sesión** por ser una petición de subrecurso cross-site.
   - El proxy Next.js recibe la petición sin cookie y responde con **HTTP 401 Unauthorized** ("Sesión no válida"), abortando la hidratación.
   - Además, la política CORS del backend de Next.js no expone `GET` en `Access-Control-Allow-Methods` para llamadas con credenciales cross-origin, lo cual representa un riesgo de bloqueo CORS secundario.

---

## 2. Información del Entorno y Datos de Prueba

* **Barbería de Prueba (QA Tenant):** 
  - `barberia_id`: `198`
  - `slug`: `barberia-prueba-4`
* **URLs de Producción Auditadas:**
  - **WordPress Core & Onboarding:** `https://barberagency-barberagency.gymh5g.easypanel.host/registro-barberias/`
  - **Next.js Dashboard App:** `https://barberagency-app.gymh5g.easypanel.host/barberia`
  - **Dashboard State Endpoint (Proxy):** `https://barberagency-app.gymh5g.easypanel.host/api/dashboard/state`
  - **n8n Backend Webhook (Upstream):** `https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/state`

---

## 3. Evidencia del Diagnóstico Real de Producción

### 3.1. Estado de la Variable Global (`window.BA_PANEL_API_BASE_URL`)
* **Valor exacto detectado en producción:** `"https://barberagency-app.gymh5g.easypanel.host"`
* **Estatus:** Correcto y definido. Apoya el dominio de Next.js en producción usando HTTPS y coincide con la URL del panel desplegado.

### 3.2. Identidad en URL
* Los parámetros URL cargan correctamente en el flujo real:
  `?mode=edit&barberia_id=198&slug=barberia-prueba-4`
* La función `getEditIdentity()` lee correctamente la identidad (`barberia_id = 198` y `slug = "barberia-prueba-4"`).

### 3.3. Comportamiento del Endpoint `/api/dashboard/state` en Producción

#### Escenario A: Petición desde Navegador en WordPress (Cross-Origin)
* **Resultado:** **HTTP 401 Unauthorized**
* **Causa:** El navegador bloquea la transmisión de la cookie `ba_session` debido a la política `SameSite=Lax` en llamadas fetch cross-site.
* **Respuesta JSON:**
  ```json
  {
    "ok": false,
    "message": "Sesion no valida"
  }
  ```

#### Escenario B: Petición desde el Panel de Control (Same-Origin) o Simulación con Cookie Directa
* **Resultado:** **HTTP 200 OK**
* **Headers de Respuesta (CORS):**
  - `access-control-allow-origin: https://barberagency-barberagency.gymh5g.easypanel.host`
  - `access-control-allow-credentials: true`
  - `access-control-allow-methods: POST, OPTIONS` *(Falta el método GET en los permitidos)*
* **Respuesta JSON (Resumida de Producción Real):**
  ```json
  {
    "ok": true,
    "identity": {
      "barberia_id": 198,
      "slug": "barberia-prueba-4"
    },
    "barberia": {
      "id": 198,
      "nombre": "Barberia Prueba 4",
      "slug": "barberia-prueba-4",
      "slot_min": 15,
      "telefono": "3106974573",
      "direccion": "Calle 131#101-10",
      "ciudad": "Bogota"
    },
    "owner": {
      "id": 7,
      "nombre": "Carlos Alvis",
      "email": "pildorasdeautomatizacion@gmail.com"
    },
    "barberos": [
      {
        "id": 440,
        "nombre": "Barbero Prueba 4.1",
        "email": "barberopruab4@gmail.com",
        "activo": true
      }
    ],
    "servicios": [
      {
        "id": 489,
        "nombre": "Corte Clasico",
        "duracion_min": 30,
        "precio": 20000,
        "activo": true
      }
    ],
    "seed": {
      "hours": [
        { "dia_semana": 1, "activo": true, "hora_abre": "08:00:00", "hora_cierra": "20:00:00" }
      ]
    },
    "merged": {
      "hours": [
        { "dia_semana": 1, "activo": true, "hora_abre": "08:00:00", "hora_cierra": "20:00:00" }
      ]
    },
    "descansos": []
  }
  ```

---

## 4. Auditoría de Despliegue y Commits

### 4.1. Verificación del HTML en Producción
Se confirmó mediante descarga directa del HTML de producción que la página `registro-barberias` **sí tiene el código actualizado**.
* Contiene la variable global fixed `window.BA_PANEL_API_BASE_URL`.
* Contiene el fix de variable de ámbito local:
  ```javascript
  const sourceDraft =
    (payload && payload.draft && typeof payload.draft === "object" ? payload.draft : null) ||
    (typeof draft !== "undefined" && draft && typeof draft === "object" ? draft : null) ||
    {};
  ```
* **Conclusión:** El despliegue de archivos estáticos en WordPress es el correcto.

### 4.2. Estado de Commits contra Producción
* **panel_de_barberia (Next.js):** En sincronía completa con `origin/principal`. El commit en producción es `b23bf17` ("feat(citas): unify dashboard booking flow").
* **barberagency-core:** El repositorio local está retrasado por 17 commits respecto a `origin/main`. Sin embargo, el último commit en producción de WordPress contiene las plantillas necesarias actualizadas.

---

## 5. Tabla de Contrato JSON (Esperado vs Real)

| Campo en `registrobarberia.html` | Campo en `r.servicios` / `r.barberos` / `r.seed` (API State) | Estatus | Observación |
| :--- | :--- | :--- | :--- |
| `data.ok === true` | `body.ok === true` | **OK** | Coincide. |
| `data.barberia` | `body.barberia` | **OK** | Estructura coincidente. |
| `data.servicios` | `body.servicios` | **OK** | Devuelve array directo. |
| `data.barberos` | `body.barberos` | **OK** | Devuelve array directo con mails e IDs. |
| `data.seed.hours` \|\| `data.merged.hours` | `body.seed.hours` / `body.merged.hours` | **OK** | Ambos arrays contienen los 7 días formateados. |
| `owner.email` | `body.owner.email` | **OK** | Correctamente expuesto por n8n. |

---

## 6. Variables de Entorno Auditadas (Next.js App)

A través del análisis del código de Next.js, se validó que los proxies están mapeados a las siguientes variables del lado del servidor:

1. **`DASHBOARD_STATE_ENDPOINT`** (Proxy `/api/dashboard/state`): Resuelve exitosamente contra el webhook de n8n.
2. **`POSTGREST_BASE_URL` / `POSTGREST_URL`** (Proxy `/api/dashboard/state`): Configurado y activo, ya que la consulta complementaria a `barberos_descansos` resolvió con éxito y devolvió datos sin errores 500/502.
3. **`SESSION_ME_ENDPOINT`** (Proxy `/api/session/me` y autenticador de editor): Activo y validando tokens.
4. **`EDITOR_DRAFT_ENDPOINT`** (Proxy `/api/editor/draft`): Activo.
5. **`EDITOR_PUBLISH_ENDPOINT`** (Proxy `/api/editor/publish`): Activo.

---

## 7. Causa Raíz Probable

1. **Omisión de Cookie Cross-Site (Principal):** El frontend (WordPress) y el backend API (Next.js) corren en subdominios diferentes. Como la cookie de sesión `ba_session` se genera con `SameSite=Lax`, los navegadores (Chrome, Safari, Firefox) no la transmiten en peticiones fetch asíncronas realizadas desde el dominio de WordPress hacia el panel, resultando en un error HTTP `401 Unauthorized` constante para el endpoint `/api/dashboard/state`.
2. **Inexistencia de Soporte para Token Bearer:** El proxy Next.js solo confía en el header `Cookie` para validar sesión. Si el token está en el URL o localStorage, el frontend no tiene forma de enviarlo de forma segura a través de un header HTTP alternativo como `Authorization: Bearer <token>`.
3. **CORS Headers Incompletos:** `Access-Control-Allow-Methods` en Next.js solo expone `POST, OPTIONS`, omitiendo el método `GET` que utiliza el endpoint `/api/dashboard/state`.

---

## 8. Diagnóstico de Criterios del Sistema

* **Si /api/dashboard/state da 401:** 
  - **Causa raíz:** La cookie `ba_session` no viaja por las restricciones de dominio/CORS/SameSite del navegador.

---

## 9. Recomendación de Corrección (Sin Modificar Código)

### Solución A: Sincronización Same-Origin en Ingress/Nginx (Recomendada)
Configurar el proxy en EasyPanel / Nginx para que tanto WordPress como Next.js compartan el mismo dominio de origen y protocolo, segmentando por rutas:
* Dominio único: `https://barberia.midominio.com`
* WordPress (Landings / Registro): `/`
* Next.js Panel App: `/panel/` o `/barberia/`
* Next.js API Routes: `/api/`
Esto elimina el problema cross-origin por completo y las cookies SameSite=Lax funcionarán de inmediato sin CORS ni vulnerabilidades.

### Solución B: Exposición de Token en Cabecera `Authorization` (Fallback Rápido de Código)
1. Modificar el proxy Next.js (`src/app/api/editor/auth.ts`) para aceptar autenticación vía Bearer Token en el header de autorización, además del lector de cookies tradicional:
   ```typescript
   const authHeader = request.headers.get("authorization") || "";
   const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
   const baSession = tokenFromHeader || readBaSession(request.headers.get("cookie") || "");
   ```
2. Modificar `registrobarberia.html` y el Editor para guardar temporalmente el token en `sessionStorage` tras la autenticación y adjuntarlo en la cabecera:
   ```javascript
   headers: {
     'Authorization': `Bearer ${sessionStorage.getItem('ba_session_token')}`
   }
   ```
3. Corregir `getCorsHeaders` en Next.js para admitir el método `GET` en los métodos permitidos y el header `Authorization` en los headers permitidos.

---

## 10. Checklist de Verificación Post-Fix

- [ ] Abrir el flujo de edición con sesión activa en `/registro-barberias/?mode=edit&barberia_id=198&slug=barberia-prueba-4`.
- [ ] Verificar en Network que la petición a `/api/dashboard/state` no devuelva error CORS ni HTTP 401.
- [ ] Confirmar que el asistente de registro cargue los campos de servicios, barberos y horarios correctos.
- [ ] Confirmar que al guardar o pasar al editor, la semilla `ba_landing_seed` contenga los arreglos de datos poblados.
- [ ] Verificar que en el Dashboard (Next.js) se visualicen los datos comerciales correctos.
