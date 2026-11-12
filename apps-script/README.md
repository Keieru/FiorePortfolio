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

- Nueva solicitud → evento **"⏳ Pendiente — Nombre"** en tu calendario + correo de aviso. La persona recibe un acuse de recibo.
- **Confirmar:** cambia el título del evento (p. ej. "Sesión — Nombre").
- **Rechazar o liberar la hora:** borra el evento.
- **Bloquear horas o días** (vacaciones, médicos…): crea un evento en tu calendario.

## Si cambias el código

**Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar.** La URL se mantiene.
Si creas una implementación nueva, la URL cambia y debes actualizar `apiUrl`.

Límites de la cuenta gratuita: unos 100 correos al día, más que suficiente.
