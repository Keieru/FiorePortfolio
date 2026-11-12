# Backend de reservas (Google Apps Script)

Guarda cada solicitud como evento en tu Google Calendar y evita que dos personas pidan la misma hora.
Cualquier evento de tu calendario que coincida con una hora (también los personales) la marca como ocupada en la web, sin mostrar detalles.

## Puesta en marcha (una sola vez)

1. Entra en https://script.google.com con la cuenta de Google cuyo calendario quieres usar → **Nuevo proyecto**.
2. Borra el contenido de `Código.gs` y pega el de [`Code.gs`](./Code.gs).
3. **Configuración del proyecto** (icono ⚙️) → *Zona horaria* → **(GMT+01:00) Madrid**.
4. Opcional: en `CONFIG`, pon tu correo en `notifyEmail` si quieres los avisos en otra dirección.
5. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier usuario**
6. Autoriza los permisos (Calendar y Gmail). Si aparece "Google no ha verificado esta aplicación": *Configuración avanzada → Ir a … (no seguro)*. Es tu propio script.
7. Copia la **URL de la aplicación web** (termina en `/exec`) y pégala en `apiUrl` en `src/data/booking.ts`.

## Uso diario

Cada solicitud bloquea la hora en tu calendario como evento amarillo **"⏳ Pendiente — Nombre"** y te llega un correo con:

- **✅ Confirmar cita**: abre una página donde pulsas *Confirmar*. El evento pasa a verde, **"✅ Sesión — Nombre"**, y la persona recibe un correo con la cita y un archivo `.ics` / enlace para añadirla a su calendario.
- **❌ Rechazar y liberar**: abre una página donde pulsas *Rechazar*. Se borra el evento, la hora vuelve a estar libre en la web y la persona recibe un aviso para elegir otra.
- **📅 Ver en Google Calendar**: abre el evento.

Los botones llevan una firma secreta: nadie puede confirmar ni borrar citas cambiando la URL. Ese secreto se genera solo la primera vez y se guarda en *Configuración del proyecto → Propiedades del script* (`LINK_SECRET`); si lo borras, los enlaces de correos antiguos dejan de funcionar.

La página intermedia con botón existe porque algunos antivirus de correo abren los enlaces automáticamente: así nunca se confirma ni se borra nada sin tu clic.

También puedes seguir gestionando a mano en Google Calendar (borrar un evento libera la hora). Para **bloquear horas o días** (vacaciones, médico…), crea un evento en tu calendario.

Opcional: pon la URL de tu web en `siteUrl` dentro de `CONFIG` para que aparezca en el correo de rechazo.

## Si cambias el código

**Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar.** La URL se mantiene.
Si creas una implementación nueva, la URL cambia y debes actualizar `apiUrl`.

Límites de la cuenta gratuita: unos 100 correos al día, más que suficiente.
