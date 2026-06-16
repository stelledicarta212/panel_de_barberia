# Reporte de Implementación: Same-Origin Routing para Hidratación del Registro/Onboarding

* **Fecha de Implementación:** 2026-06-16
* **Arquitecto Senior / DevOps:** Antigravity (Advanced Agentic Coding Team, Google DeepMind)
* **Estado:** **IMPLEMENTADO Y LISTO PARA QA**
* **Decisión de Seguridad/Código:** **Cero modificaciones a n8n, Base de Datos, PostgREST, RLS o flujos JWT.**

---

## 1. Causa Raíz (Fallo de Hidratación P0)

* **Entorno:** WordPress/Onboarding corre bajo `https://barberagency-barberagency.gymh5g.easypanel.host` y Next.js Panel corre bajo `https://barberagency-app.gymh5g.easypanel.host`.
* **Mecanismo del Fallo:** La cookie de sesión `ba_session` es generada por el panel con la directiva `SameSite=Lax`. Al cargar el asistente de configuración (`registrobarberia.html`), el frontend realiza una petición asíncrona (`fetch`) a `https://barberagency-app.gymh5g.easypanel.host/api/dashboard/state` para obtener datos de hidratación.
* **Bloqueo del Navegador:** Al ser subdominios/orígenes diferentes en contexto de subrecurso fetch, el navegador **omite enviar la cookie de sesión** (`ba_session`) para proteger contra CSRF. El proxy Next.js al no recibir la cookie responde con **HTTP 401 Unauthorized** ("Sesión no válida"), abortando la hidratación y dejando la UI sin datos de servicios, barberos u horarios.

---

## 2. Solución Aplicada (Same-Origin Routing)

Se eliminó la dependencia de llamadas cross-origin mediante el direccionamiento de todas las rutas del panel y de la API a través del dominio principal de WordPress en el nivel del proxy/ingress, unificando el origen:

1. **Rutas unificadas bajo el mismo origen:**
   * `/api/*` -> Next.js App
   * `/_next/*` -> Next.js App
   * `/barberia/*` y rutas hijas del panel -> Next.js App
   * `/wp-admin/*`, `/wp-content/*`, etc. -> WordPress
   * `/registro-barberias/*` -> WordPress
   * `/*` (Fallback) -> WordPress

2. **Migración a URLs Relativas:** Se reemplazaron todas las referencias y URLs absolutas hardcodeadas a Next.js y WordPress por rutas relativas en el código, garantizando que el navegador realice solicitudes al mismo origen donde se carga la página.

---

## 3. Archivos Modificados

### 3.1. En `barberagency-core`
* **[registrobarberia.html](file:///root/github/barberagency-core/project/templates/plantillas/registrobarberia.html):** 
  * Se removió el valor predeterminado del dominio de Next.js de `window.BA_PANEL_API_BASE_URL` para que por defecto sea cadena vacía (`""`), obligando al uso de rutas relativas.
  * Se actualizó `stateUrl` para usar la API base relativa con parámetros debidamente codificados: `${PANEL_API_BASE}/api/dashboard/state?barberia_id=${encodeURIComponent(identity.barberia_id)}&slug=${encodeURIComponent(identity.slug)}`.
* **[landing_editor_v2_unico_vscode.html](file:///root/github/barberagency-core/project/templates/editor/landing_editor_v2_unico_vscode.html):**
  * Se convirtió `DEFAULT_REGISTRO_URL` a `/registro-barberias/`.
  * Se convirtió `DEFAULT_SAVE_ENDPOINT` a `/api/editor/publish`.
  * Se convirtió `DEFAULT_DASHBOARD_URL` a `/barberia`.
* **[boton.html](file:///root/github/barberagency-core/boton.html):**
  * Se convirtieron las URLs absolutas de WordPress (`BA_HOME_URL`, `BA_REGISTER_URL`, `BA_CREATE_BARBERIA_URL`, `BA_PROFILE_URL`, `BA_PLANS_URL`) y Next.js (`BA_DASHBOARD_URL`) a sus respectivos paths relativos (`/`, `/registro/`, `/registro-barberias/`, `/perfil/`, `/planes/`, `/barberia`).

### 3.2. En `panel_de_barberia`
* **[dashboard-shell.tsx](file:///root/github/panel_de_barberia/src/components/dashboard-shell.tsx):**
  * Se cambió `CORE_BASE_URL` a `""` para evitar redirigir de vuelta al dominio absoluto de WordPress.
  * Se convirtió la URL de la imagen de bienvenida a ruta relativa: `/wp-content/uploads/2026/02/Sin-titulo-600-x-700-px.png`.
* **[page.tsx (barberos)](file:///root/github/panel_de_barberia/src/app/barberos/page.tsx):**
  * Se cambiaron las imágenes fallback de barberos a rutas relativas `/wp-content/uploads/...`.
  * Se actualizó el enlace del botón "Editar barberos" a ruta relativa: `/registro-barberias/`.

---

## 4. Configuración del Reverse Proxy en EasyPanel (Ingress/Nginx)

Para activar el mismo origen en producción, se debe añadir el siguiente fragmento en la sección de configuración de Nginx del servicio de WordPress (`barberagency-barberagency`):

```nginx
location ~ ^/(api|_next|barberia|citas|barberos|servicios|inventario|finanzas|configuracion)(/.*)?$ {
    proxy_pass http://barberagency-app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

> [!NOTE]
> `barberagency-app` es el nombre del servicio contenedor de Next.js en EasyPanel y el puerto `3000` es su puerto de escucha HTTP por defecto.

---

## 5. HTML Listo para WordPress (QA)

El código HTML/JS finalizado para el onboarding se encuentra en:
👉 **[registrobarberia.html](file:///root/github/barberagency-core/project/templates/plantillas/registrobarberia.html)**

### Procedimiento para duplicar e instalar en QA (Fase 5):
1. Acceder al panel de administración de WordPress.
2. Ir a Páginas y buscar la página `/registro-barberias/`.
3. Duplicar la página con un plugin de clonación o copiar su estructura en una nueva página.
4. Asignarle el slug: `/registro-barberias-qa/`.
5. En el editor de la página `/registro-barberias-qa/`, reemplazar todo el código HTML personalizado con el contenido completo del archivo `registrobarberia.html`.
6. Publicar la página.

---

## 6. Checklist de QA (Validaciones obligatorias)

- [ ] Cargar en el navegador la página:
  `https://barberagency-barberagency.gymh5g.easypanel.host/registro-barberias-qa/?mode=edit&barberia_id=198&slug=barberia-prueba-4`
- [ ] Abrir las Herramientas de Desarrollador (F12) -> Consola:
  - Validar que no existan errores JavaScript de carga o bloqueo CORS.
- [ ] En la pestaña Network:
  - Filtrar por `state` y verificar la solicitud:
    - **URL:** `https://barberagency-barberagency.gymh5g.easypanel.host/api/dashboard/state?barberia_id=198&slug=barberia-prueba-4` (O la ruta relativa `/api/...`)
    - **Status Code:** `200 OK`
    - **Request Headers:** Debe contener la cabecera `Cookie: ba_session=...`.
  - Confirmar que la respuesta contenga los arrays poblados de `servicios`, `barberos` y `seed.hours`/`merged.hours`.
- [ ] En la interfaz de usuario:
  - Comprobar que los campos de datos de la barbería (nombre, teléfono, ciudad), servicios registrados, barberos y horarios se visualicen perfectamente y completen de forma automática.
  - Asegurar que `ba_landing_seed` en `localStorage`/`sessionStorage` no se inicialice vacío.

---

## 7. Plan de Rollback (Reversión)

Si se presentan problemas críticos durante la activación del proxy:
1. Eliminar la directiva `location` personalizada de Nginx en EasyPanel para restaurar el flujo directo de WordPress.
2. Inyectar en la cabecera global de scripts de WordPress la variable anterior para restaurar el fallback absoluto de la app de Next.js sin alterar el HTML base:
   ```html
   <script>window.BA_PANEL_API_BASE_URL = "https://barberagency-app.gymh5g.easypanel.host";</script>
   ```

---

## 8. Riesgos y Mitigación

* **Riesgo de colisión de rutas en WordPress:** Si WordPress o un plugin utiliza una ruta que comience por `/api` o `/barberia`, el tráfico será erróneamente enrutado a Next.js.
  * *Mitigación:* Se verificó en la base de datos de WordPress que no existen páginas ni endpoints de plugins con estos slugs. Las landings públicas de los usuarios se sirven bajo el prefijo `/b/*` (`/b/slug`), lo cual queda fuera de las reglas del proxy y se mantiene en WordPress.
