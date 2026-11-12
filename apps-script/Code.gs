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

// ---------- GET: horas ocupadas ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
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
    cal.createEvent(CONFIG.eventTitlePrefix + name, start, end, {
      description:
        "Solicitud desde la web\n\n" +
        "Nombre: " + name + "\n" +
        "Email: " + email + "\n" +
        "Mensaje: " + (message || "(sin mensaje)") + "\n\n" +
        "Consentimiento RGPD: sí (" + new Date().toISOString() + ")\n\n" +
        "Para confirmar, cambia el título. Para liberar la hora, borra el evento.",
    });
    cache.put(hourKey, String(hourCount + 1), 3600);
    cache.put(emailKey, String(emailCount + 1), 86400);
  } finally {
    lock.releaseLock();
  }

  try {
    const notify = CONFIG.notifyEmail || Session.getEffectiveUser().getEmail();
    MailApp.sendEmail({
      to: notify,
      replyTo: email,
      subject: "Nueva solicitud de cita: " + label,
      body:
        "Nombre: " + name + "\nEmail: " + email + "\nCita: " + label + " (hora de Madrid)\n\n" +
        "Mensaje:\n" + (message || "(sin mensaje)") + "\n\n" +
        "La hora ha quedado bloqueada como pendiente en tu Google Calendar.",
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
