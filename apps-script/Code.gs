/**
 * Backend de reservas para la web de Fiorella Ailen Litarelli.
 * Se pega en https://script.google.com y se despliega como "Aplicación web".
 * Ver apps-script/README.md.
 *
 * Mantén estos valores alineados con src/data/booking.ts.
 */
const CONFIG = {
  timeZone: "Europe/Madrid",
  startHour: 10,
  endHour: 18, // la última sesión empieza a las 17:00
  workDays: [1, 2, 3, 4, 5], // 0 = domingo … 6 = sábado
  minNoticeDays: 1,
  daysAhead: 90,
  /** Correo donde recibes el aviso de cada solicitud. Vacío = el de la cuenta que despliega. */
  notifyEmail: "",
  /** Enviar un acuse de recibo a la persona que solicita la cita. */
  sendAck: true,
  eventTitlePrefix: "⏳ Pendiente — ",
  confirmedTitlePrefix: "✅ Sesión — ",
  /** URL de la web (se usa en el correo de rechazo para que la persona elija otra hora). */
  siteUrl: "",
  /** Límite anti-abuso: solicitudes totales aceptadas por hora. */
  maxRequestsPerHour: 10,
  /** Límite anti-abuso: solicitudes por correo electrónico cada 24 h. */
  maxRequestsPerEmailPerDay: 1,
};

// ---------- Utilidades ----------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function pad_(n) {
  return (n < 10 ? "0" : "") + n;
}

/** "YYYY-MM-DD" → Date a las 00:00 en la zona del script. */
function parseDay_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function addDays_(d, n) {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function today_() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function key_(day, hour) {
  return Utilities.formatDate(day, CONFIG.timeZone, "yyyy-MM-dd") + " " + pad_(hour) + ":00";
}

function calendar_() {
  return CalendarApp.getDefaultCalendar();
}

function overlaps_(events, start, end) {
  return events.some(function (ev) {
    return ev.getStartTime() < end && ev.getEndTime() > start;
  });
}

function esc_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slotLabel_(start) {
  return Utilities.formatDate(start, CONFIG.timeZone, "dd/MM/yyyy 'a las' HH:mm");
}

// ---------- Firma de los enlaces Confirmar / Rechazar ----------

/** Secreto aleatorio guardado en las propiedades del script (no está en el código). */
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty("LINK_SECRET");
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("LINK_SECRET", s);
  }
  return s;
}

function sign_(action, id) {
  const bytes = Utilities.computeHmacSha256Signature(action + ":" + id, secret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function verify_(action, id, sig) {
  const expected = sign_(action, id);
  const given = String(sig || "");
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function actionUrl_(action, id) {
  return (
    ScriptApp.getService().getUrl() +
    "?action=" + action +
    "&id=" + encodeURIComponent(id) +
    "&sig=" + sign_(action, id)
  );
}

function calendarEventUrl_(event) {
  const eid = Utilities.base64Encode(event.getId().split("@")[0] + " " + calendar_().getId()).replace(/=+$/, "");
  return "https://calendar.google.com/calendar/event?eid=" + eid;
}

/** Evento pendiente válido para una acción firmada, o null. */
function pendingEvent_(action, id, sig) {
  if ((action !== "confirm" && action !== "reject") || !id || !verify_(action, id, sig)) return null;
  const event = calendar_().getEventById(id);
  if (!event || event.getTag("status") !== "pending") return null;
  return event;
}

// ---------- Página de confirmación (desde el correo de Fiorella) ----------

function page_(title, bodyHtml) {
  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<style>body{font-family:Georgia,serif;background:#f3f2f2;color:#201f1d;margin:0;padding:32px 16px}" +
    ".card{max-width:460px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:6px;padding:24px}" +
    "h1{font-size:22px;margin:0 0 12px}p{line-height:1.6}" +
    "button{font:inherit;font-weight:600;border:0;border-radius:4px;padding:12px 18px;color:#fff;cursor:pointer;width:100%}" +
    ".ok{background:#2e7d32}.no{background:#b3261e}button:disabled{opacity:.5}</style></head><body><div class=\"card\">" +
    "<h1>" + esc_(title) + "</h1>" + bodyHtml + "</div></body></html>";
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function actionPage_(p) {
  const event = pendingEvent_(p.action, p.id, p.sig);
  if (!event) {
    return page_("Solicitud ya gestionada", "<p>Este enlace no es válido o la cita ya fue confirmada, rechazada o eliminada.</p>");
  }
  const confirm = p.action === "confirm";
  const info =
    "<p><strong>" + esc_(event.getTag("name")) + "</strong> (" + esc_(event.getTag("email")) + ")<br>" +
    esc_(slotLabel_(event.getStartTime())) + " (hora de Madrid)</p>";
  const button =
    '<button id="b" class="' + (confirm ? "ok" : "no") + '">' +
    (confirm ? "Confirmar cita" : "Rechazar y liberar la hora") + "</button>" +
    '<p id="r"></p>' +
    "<script>document.getElementById('b').onclick=function(){var b=this;b.disabled=true;b.textContent='Procesando…';" +
    "google.script.run.withSuccessHandler(function(m){b.remove();document.getElementById('r').textContent=m;})" +
    ".withFailureHandler(function(){b.disabled=false;b.textContent='Reintentar';document.getElementById('r').textContent='No se pudo completar.';})" +
    ".applyAction(" + JSON.stringify(p.action) + "," + JSON.stringify(p.id) + "," + JSON.stringify(p.sig) + ");};</script>";
  return page_(confirm ? "¿Confirmar esta cita?" : "¿Rechazar esta cita?", info + button);
}

/** Llamada desde la página de confirmación. Solo actúa con una firma válida. */
function applyAction(action, id, sig) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const event = pendingEvent_(action, id, sig);
    if (!event) return "Esta solicitud ya fue gestionada.";

    const name = event.getTag("name");
    const email = event.getTag("email");
    const start = event.getStartTime();
    const end = event.getEndTime();
    const label = slotLabel_(start);

    if (action === "confirm") {
      event.setTitle(CONFIG.confirmedTitlePrefix + name);
      event.setColor(CalendarApp.EventColor.GREEN);
      event.setTag("status", "confirmed");
      sendConfirmation_(email, start, end, label);
      return "Cita confirmada. " + name + " ha recibido un correo con la invitación.";
    }

    event.deleteEvent();
    sendRejection_(email, label);
    return "Cita rechazada. La hora vuelve a estar libre y " + name + " ha recibido un aviso.";
  } finally {
    lock.releaseLock();
  }
}

// ---------- Correos a la persona que solicita ----------
// No incluyen texto escrito en el formulario, para que nadie pueda usarlos para enviar mensajes a terceros.

const SIGNATURE_ = "\n\nFiorella Ailen Litarelli\nPsicóloga Colegiada M-45324";

function icsDate_(d) {
  return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

function sendConfirmation_(email, start, end, label) {
  const title = "Sesión con Fiorella Ailen Litarelli";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fiorella Ailen Litarelli//Citas//ES", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + Utilities.getUuid() + "@citas",
    "DTSTAMP:" + icsDate_(new Date()),
    "DTSTART:" + icsDate_(start),
    "DTEND:" + icsDate_(end),
    "SUMMARY:" + title,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const gcal =
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) +
    "&dates=" + icsDate_(start) + "/" + icsDate_(end) + "&ctz=" + encodeURIComponent(CONFIG.timeZone);

  MailApp.sendEmail({
    to: email,
    name: "Fiorella Ailen Litarelli",
    replyTo: CONFIG.notifyEmail || Session.getEffectiveUser().getEmail(),
    subject: "Cita confirmada: " + label,
    body:
      "Hola,\n\nTu cita queda confirmada para el " + label + " (hora de Madrid).\n\n" +
      "Añádela a tu calendario con el archivo adjunto o desde este enlace:\n" + gcal +
      "\n\nSi necesitas cambiarla, responde a este correo." + SIGNATURE_,
    attachments: [Utilities.newBlob(ics, "text/calendar", "cita.ics")],
  });
}

function sendRejection_(email, label) {
  MailApp.sendEmail({
    to: email,
    name: "Fiorella Ailen Litarelli",
    replyTo: CONFIG.notifyEmail || Session.getEffectiveUser().getEmail(),
    subject: "Sobre tu solicitud de cita",
    body:
      "Hola,\n\nLo siento, no puedo atenderte el " + label + ". " +
      (CONFIG.siteUrl ? "Puedes elegir otra hora aquí: " + CONFIG.siteUrl + "\n\n" : "Puedes solicitar otra hora desde la web.\n\n") +
      "Si lo prefieres, responde a este correo y buscamos otro hueco." + SIGNATURE_,
  });
}

// ---------- GET: horas ocupadas (o página de confirmación si lleva ?action=) ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return actionPage_(p);
  const today = today_();
  let from = parseDay_(p.from) || today;
  let to = parseDay_(p.to) || addDays_(today, CONFIG.daysAhead);
  if (from < today) from = today;
  const max = addDays_(today, CONFIG.daysAhead);
  if (to > max) to = max;

  const rangeEnd = addDays_(to, 1);
  const events = from < rangeEnd ? calendar_().getEvents(from, rangeEnd) : [];
  const busy = [];

  for (let day = new Date(from.getTime()); day < rangeEnd; day = addDays_(day, 1)) {
    if (CONFIG.workDays.indexOf(day.getDay()) === -1) continue;
    for (let h = CONFIG.startHour; h < CONFIG.endHour; h++) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h + 1);
      if (overlaps_(events, start, end)) busy.push(key_(day, h));
    }
  }

  return json_({ ok: true, busy: busy });
}

// ---------- POST: solicitar cita ----------

function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "invalid" });
  }

  // Honeypot anti-spam: los humanos no rellenan este campo.
  if (data.website) return json_({ ok: true });

  // Quita saltos de línea y caracteres de control para que el nombre no pueda inyectar texto.
  const name = String(data.name || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const email = String(data.email || "").trim().toLowerCase().slice(0, 200);
  const message = String(data.message || "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, 2000);
  const consent = data.acepta_privacidad === "sí" || data.acepta_privacidad === true;

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !consent) {
    return json_({ ok: false, error: "invalid" });
  }

  const day = parseDay_(data.fecha);
  const hm = /^(\d{2}):00$/.exec(String(data.hora || ""));
  if (!day || !hm) return json_({ ok: false, error: "invalid" });
  const hour = Number(hm[1]);

  const today = today_();
  if (
    CONFIG.workDays.indexOf(day.getDay()) === -1 ||
    hour < CONFIG.startHour ||
    hour >= CONFIG.endHour ||
    day < addDays_(today, CONFIG.minNoticeDays) ||
    day > addDays_(today, CONFIG.daysAhead)
  ) {
    return json_({ ok: false, error: "invalid" });
  }

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour + 1);
  const label = Utilities.formatDate(start, CONFIG.timeZone, "dd/MM/yyyy 'a las' HH:mm");

  // El bloqueo garantiza que dos solicitudes simultáneas no reserven la misma hora.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return json_({ ok: false, error: "busy_server" });
  }

  let event;
  try {
    // Límites anti-abuso (dentro del bloqueo para que los contadores sean exactos).
    const cache = CacheService.getScriptCache();
    const hourKey = "rl:" + Utilities.formatDate(new Date(), CONFIG.timeZone, "yyyyMMddHH");
    const emailKey = "em:" + Utilities.base64EncodeWebSafe(email);
    const hourCount = Number(cache.get(hourKey) || 0);
    const emailCount = Number(cache.get(emailKey) || 0);
    if (hourCount >= CONFIG.maxRequestsPerHour || emailCount >= CONFIG.maxRequestsPerEmailPerDay) {
      return json_({ ok: false, error: "rate_limited" });
    }

    const cal = calendar_();
    if (overlaps_(cal.getEvents(start, end), start, end)) {
      return json_({ ok: false, error: "taken" });
    }
    event = cal.createEvent(CONFIG.eventTitlePrefix + name, start, end, {
      description:
        "Solicitud desde la web\n\n" +
        "Nombre: " + name + "\n" +
        "Email: " + email + "\n" +
        "Mensaje: " + (message || "(sin mensaje)") + "\n\n" +
        "Consentimiento RGPD: sí (" + new Date().toISOString() + ")\n\n" +
        "Confirma o rechaza desde los botones del correo de aviso.",
    });
    event.setTag("status", "pending");
    event.setTag("name", name);
    event.setTag("email", email);
    event.setColor(CalendarApp.EventColor.YELLOW);
    cache.put(hourKey, String(hourCount + 1), 3600);
    cache.put(emailKey, String(emailCount + 1), 86400);
  } finally {
    lock.releaseLock();
  }

  try {
    const notify = CONFIG.notifyEmail || Session.getEffectiveUser().getEmail();
    const id = event.getId();
    const confirmUrl = actionUrl_("confirm", id);
    const rejectUrl = actionUrl_("reject", id);
    const calUrl = calendarEventUrl_(event);
    const btn = function (href, bg, text) {
      return (
        '<a href="' + esc_(href) + '" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 18px;border-radius:4px;' +
        "background:" + bg + ';color:#ffffff;text-decoration:none;font-weight:600;font-family:Arial,sans-serif">' + text + "</a>"
      );
    };
    MailApp.sendEmail({
      to: notify,
      replyTo: email,
      subject: "Nueva solicitud de cita: " + label,
      body:
        "Nombre: " + name + "\nEmail: " + email + "\nCita: " + label + " (hora de Madrid)\n\n" +
        "Mensaje:\n" + (message || "(sin mensaje)") + "\n\n" +
        "Confirmar: " + confirmUrl + "\nRechazar: " + rejectUrl + "\nVer en Google Calendar: " + calUrl,
      htmlBody:
        '<div style="font-family:Georgia,serif;color:#201f1d;max-width:520px">' +
        '<h2 style="margin:0 0 12px">Nueva solicitud de cita</h2>' +
        "<p style=\"margin:0 0 4px\"><strong>" + esc_(label) + "</strong> (hora de Madrid)</p>" +
        "<p style=\"margin:0 0 4px\">" + esc_(name) + " · " + esc_(email) + "</p>" +
        '<p style="margin:12px 0;padding:10px;background:#f3f2f2;border-radius:4px;white-space:pre-wrap">' +
        esc_(message || "(sin mensaje)") + "</p>" +
        "<p>" +
        btn(confirmUrl, "#2e7d32", "✅ Confirmar cita") +
        btn(rejectUrl, "#b3261e", "❌ Rechazar y liberar") +
        "</p>" +
        '<p><a href="' + esc_(calUrl) + '" style="color:#7d5411">📅 Ver en Google Calendar</a></p>' +
        '<p style="font-size:12px;color:#777">La hora ya está bloqueada como pendiente. ' +
        "Al confirmar, la persona recibe un correo con la cita para añadirla a su calendario; al rechazar, la hora vuelve a quedar libre en la web.</p>" +
        "</div>",
    });
    if (CONFIG.sendAck) {
      MailApp.sendEmail({
        to: email,
        replyTo: notify,
        name: "Fiorella Ailen Litarelli",
        subject: "Solicitud de cita recibida",
        // Sin ningún texto escrito por quien envía el formulario, para que nadie pueda
        // usar este correo (enviado desde tu cuenta) para mandar mensajes a terceros.
        body:
          "Hola,\n\n" +
          "He recibido tu solicitud de cita para el " + label + " (hora de Madrid). " +
          "Te escribiré pronto para confirmarla.\n\n" +
          "Si no has realizado esta solicitud, ignora este correo.\n\n" +
          "Fiorella Ailen Litarelli\nPsicóloga Colegiada M-45324",
      });
    }
  } catch (err) {
    // La cita ya está guardada; un fallo de correo no debe romper la respuesta.
    console.error(err);
  }

  return json_({ ok: true });
}
