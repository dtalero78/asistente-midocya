// MIDOCYA ✅

// Guarda el celular ingresado por el paciente
let phoneNumber = null;

// Obtiene parámetros de la URL
function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

// Solicita la ubicación del usuario
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocalización no soportada"));
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(new Error("Error de geolocalización: " + err.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

const beepSound = new Audio('static/assets/beep.mp3');
let beepInterval;

let peerConnection = null;
let dataChannel = null;
let timerInterval = null;
let seconds = 0;
let isConnected = false;
let resumenGlobal = "";

// DOM
const ringBox = document.getElementById('ringBox');
const callButton = document.getElementById('callButton');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.querySelector('.call-status');
const timer = document.querySelector('.timer');
const speakNow = document.querySelector('.speak-now');
speakNow.style.display = 'none';
timer.style.display = 'none';

// Audio & timer helpers
function startBeeping() {
  beepSound.play();
  beepInterval = setInterval(() => beepSound.play(), 3000);
}
function stopBeeping() {
  clearInterval(beepInterval);
}
function startTimer() {
  seconds = 0;
  timer.style.display = 'block';
  timerInterval = setInterval(() => {
    seconds++;
    timer.textContent = formatTime(seconds);
  }, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  seconds = 0;
}
function formatTime(sec) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function formatCallSummary(sec) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `Call Duration: ${hrs > 0 ? hrs + 'h ' : ''}${mins > 0 ? mins + 'm ' : ''}${s}s`;
}

// Finaliza llamada y limpia UI
function endCall() {
  stopBeeping();
  stopTimer();
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (isConnected) {
    callStatus.textContent = formatCallSummary(seconds);
    endCallBtn.style.display = 'none';
    setTimeout(() => {
      ringBox.style.display = 'none';
      callButton.style.display = 'block';
      callStatus.textContent = 'Ready to call';
    }, 3000);
  }
  isConnected = false;
}

// Inicia la llamada
async function startCall() {
  ringBox.style.display = 'block';
  callStatus.textContent = 'Llamando...';
  startBeeping();
  endCallBtn.disabled = true;
  await initOpenAIRealtime();
}

// Funciones que el agente puede invocar
const fns = {
  // Envía resumen por email y WhatsApp al paciente
  sendEmail: async ({ message }) => {
    try {
      resumenGlobal = message;
      endCallBtn.style.display = 'block';

      // 1) Enviar email
      await sendEmailToBackend(message);

      // 2) Normalizar teléfono
      console.log("📥 Número de paciente capturado:", phoneNumber);
      let digits = (phoneNumber || "").replace(/\D/g, "");
      if (!digits) {
        console.warn("⚠️ No se capturó número, uso fallback");
        digits = "573008021701";
      }
      if (!digits.startsWith("57")) {
        digits = `57${digits}`;
      }

      // 3) **Definir `to` solo con dígitos**
      const to = digits;
      console.log("📱 Enviando WhatsApp a:", to);

      // 4) Enviar WhatsApp y logear resultado
      const result = await sendTextMessage(to, message);
      console.log("📤 Resultado de WHAPI:", result);

      endCall();
      return { success: true };
    } catch (error) {
      console.error("❌ Error en sendEmail:", error);
      return { success: false, error: error.message };
    }
  },

  // Guarda historia clínica y captura el celular
  guardarHistoria: async (data) => {
    phoneNumber = data.celular;
    await guardarHistoria(data);
    return { success: true };
  },

  // Envía alerta de emergencia con confirmación de ubicación
  sendEmergencyAlert: async ({ message }) => {
    try {
      let coordsText = "";
      try {
        const { latitude, longitude } = await getUserLocation();
        const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;
        const ok = confirm(`Ubicación detectada:\n${mapLink}\n\n¿Es correcta?`);
        coordsText = ok
          ? `\nUbicación confirmada: ${mapLink}`
          : `\nUbicación no confirmada`;
      } catch {
        coordsText = "\nUbicación no disponible";
      }

      // Normalizar mismo número de paciente
      let digits = (phoneNumber || "").replace(/\D/g, "");
      if (!digits.startsWith("57")) digits = `57${digits}`;
      const to = digits.length >= 11 ? digits : "573008021701";

      await sendTextMessage(to, message + coordsText);
      console.log("🚨 Emergencia enviada a:", to);

      if (dataChannel) dataChannel.close();
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      endCall();
      return { success: true };
    } catch (err) {
      console.error("❌ Error en sendEmergencyAlert:", err);
      return { success: false, error: err.message };
    }
  },

  // Agenda una cita médica
  agendar_cita: async ({ fecha, hora }) => {
    try {
      const res  = await fetch('/agendar-cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, hora })
      });
      const json = await res.json();
      return json.result;
    } catch (e) {
      return `❌ Error al agendar cita: ${e.message}`;
    }
  }
};


// Almacena la historia en el backend
async function guardarHistoria(data) {
  try {
    const res = await fetch('/guardar-historia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      console.log("📥 Historia guardada ID:", result.id);
    }
  } catch (err) {
    console.error("❌ Error al conectar al backend:", err);
  }
}

// Envía email al backend (renombrado para evitar colisión)
async function sendEmailToBackend(message) {
  const loader = document.querySelector('.loader');
  loader.style.display = 'block';
  try {
    const res = await fetch('/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (res.ok) {
      showNotification('Email enviado', 'success');
    } else {
      showNotification('Error al enviar email', 'error');
    }
  } catch {
    showNotification('Error enviando email', 'error');
  } finally {
    loader.style.display = 'none';
  }
}

// Muestra notificaciones en pantalla
function showNotification(msg, type) {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}

// Envía WhatsApp usando WHAPI
function sendTextMessage(to, body) {
  return fetch("https://gate.whapi.cloud/messages/text", {
    method: 'POST',
    headers: {
      accept: "application/json",
      authorization: "Bearer due3eWCwuBM2Xqd6cPujuTRqSbMb68lt",
      "content-type": "application/json"
    },
    body: JSON.stringify({ typing_time: 0, to, body })
  }).then(r => r.json());
}

// Inicializa la sesión Realtime de OpenAI
async function initOpenAIRealtime() {
  try {
    const tokenRes = await fetch("/session");
    const { client_secret: { value: EPHEMERAL_KEY } } = await tokenRes.json();

    peerConnection = new RTCPeerConnection();

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        stopBeeping();
        isConnected = true;
        callStatus.textContent = 'Puedes Hablar Ahora';
        timer.style.display = 'block';
        speakNow.style.display = 'block';
        startTimer();
        endCallBtn.style.display = 'none';
      }
    };

    const audioElem = document.createElement("audio");
    audioElem.autoplay = true;
    peerConnection.ontrack = e => (audioElem.srcObject = e.streams[0]);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConnection.addTrack(stream.getTracks()[0]);

    dataChannel = peerConnection.createDataChannel("response");

    function configureData() {
      const event = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          tools: [
            {
              type: "function",
              name: "sendEmail",
              description: "Envía un resumen por correo.",
              parameters: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"]
              }
            },
            {
              type: "function",
              name: "guardarHistoria",
              description: "Guarda datos clínicos.",
              parameters: {
                type: "object",
                properties: {
                  nombre: { type: "string" }, edad: { type: "string" },
                  sexo: { type: "string" }, nacimiento: { type: "string" },
                  documento: { type: "string" }, estado_civil: { type: "string" },
                  ocupacion: { type: "string" }, direccion: { type: "string" },
                  ciudad: { type: "string" }, eps: { type: "string" },
                  enfermedades: { type: "string" },
                  hospitalizaciones: { type: "string" },
                  medicamentos: { type: "string" },
                  alergias: { type: "string" },
                  celular: { type: "string" }
                },
                required: [
                  "nombre", "edad", "sexo", "nacimiento", "documento",
                  "estado_civil", "ocupacion", "direccion", "ciudad", "eps",
                  "enfermedades", "hospitalizaciones", "medicamentos", "alergias", "celular"
                ]
              }
            },
            {
              type: "function",
              name: "sendEmergencyAlert",
              description: "Envía alerta de emergencia a urgencias.",
              parameters: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"]
              }
            },
            {
              type: 'function',
              name: 'agendar_cita',        // <— aquí
              description: 'Agendar cita médica para fecha y hora dadas.',
              parameters: {
                type: 'object',
                properties: {
                  fecha: { type: 'string', description: 'YYYY-MM-DD' },
                  hora: { type: 'string', description: 'HH:MM' }
                },
                required: ['fecha', 'hora']
              }
            }
          ]
        }
      };
      dataChannel.send(JSON.stringify(event));
    }

    dataChannel.addEventListener("open", async () => {
      configureData();

      const patientId = getQueryParam("_id");
      let sentCustom = false;

      if (patientId) {
        try {
          const res = await fetch(`/historia/${patientId}`);
          const json = await res.json();
          if (json.success && json.historia) {
            const h = json.historia;
            const name = (h.nombre || "paciente").split(" ")[0];
            const context = `
Historial de ${name}:
- Edad: ${h.edad}
- Sexo: ${h.sexo}
- Nacimiento: ${h.nacimiento}
- Documento: ${h.documento}
- Estado civil: ${h.estado_civil}
- Ocupación: ${h.ocupacion}
- Dirección: ${h.direccion}
- Ciudad: ${h.ciudad}
- EPS: ${h.eps}
- Enfermedades: ${h.enfermedades}
- Hospitalizaciones: ${h.hospitalizaciones}
- Medicamentos: ${h.medicamentos}
- Alergias: ${h.alergias}
- Celular: ${h.celular || "pendiente"}
            `;
            const customInstructions = `
Eres un asistente médico de BodyTech Salud para ${h.nombre}.
Saluda: "Hola ${name}, soy tu asistente de BodyTech Salud."
No salgas de temas de salud.

${context}

/* Emergencia vital */
Si detectas emergencia vital (dolor de pecho, falta extrema de aire,
pérdida de consciencia, sangrado fuerte):
1) Decir: "Contactando urgencias de inmediato."
2) Llamar a sendEmergencyAlert({ message: "🚨 EMERGENCIA – Paciente: ${h.nombre}, Edad: ${h.edad}, Doc: ${h.documento}. Historial: ${h.enfermedades}; Alergias: ${h.alergias}" })

/* Cita médica */
Si el paciente necesita cita, llamar a agendar_cita({
  date: "YYYY-MM-DD",
  time: "HH:MM",
  patientName: "${h.nombre}",
  reason: "Motivo de la cita"
});
            `;
            dataChannel.send(JSON.stringify({
              type: "session.update",
              session: { instructions: customInstructions }
            }));
            sentCustom = true;
          }
        } catch (e) {
          console.warn("⚠️ No se pudo obtener historia:", e);
        }
      }

      if (!sentCustom) {
        const systemInstructions = `
Eres un asistente médico de BodyTech Salud. Vamos a abrir tu historia clínica:
Preguntas (una a la vez):
- Nombre completo
- Edad
- Sexo
- Fecha de nacimiento
- Documento de identidad
- Estado civil
- Ocupación
- Dirección
- Ciudad de residencia
- EPS o seguro médico
- ¿Ha tenido alguna enfermedad importante?
- ¿Ha sido hospitalizado o cirugías?
- ¿Toma medicamentos actualmente?
- ¿Es alérgico a algo?
- Número de celular
Despídete con: "Gracias por usar BodyTech Salud. Estamos creando tu historia clínica y en un momento recibirás confirmación por whatsapp. No cierres la ventana."

1) Genera un **resumen completo** de todo lo conversado (síntesis de síntomas, diagnostico, recomendaciones…).
2) Llama a sendEmail pasando ese texto como argumento:
   sendEmail({ message: resumen })
   donde ‘resumen’ es el string que tú mismo formaste con los puntos clave.
3) Si el paciente necesita agendar cita, llama a agendar_cita({ fecha: "...", hora: "..." }).

        `;
        dataChannel.send(JSON.stringify({
          type: "session.update",
          session: { instructions: systemInstructions }
        }));
      }
    });

    dataChannel.addEventListener("message", async ev => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "response.function_call_arguments.done") {
          const fn = fns[msg.name];
          if (fn) {
            const args = JSON.parse(msg.arguments);
            const result = await fn(args);
            dataChannel.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: msg.call_id,
                output: JSON.stringify(result)
              }
            }));
          }
        }
      } catch (err) {
        console.error("❌ Error handler:", err);
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const model = "gpt-4o-realtime-preview-2024-12-17";  // <— defínelo aquí

    // CORRECTO: intercambia SDP con OpenAI Realtime
    const apiUrl = "https://api.openai.com/v1/realtime";
    const sdpRes = await fetch(`${apiUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp"
      }

    });
    const answer = { type: "answer", sdp: await sdpRes.text() };
    await peerConnection.setRemoteDescription(answer);

  } catch (error) {
    console.error("❌ Error en initOpenAIRealtime:", error);
    endCall();
  }
}

// Eventos
callButton.addEventListener("click", startCall);
endCallBtn.addEventListener("click", async () => {
  if (resumenGlobal) {
    await fns.sendEmail({ message: resumenGlobal });
  }
  endCall();
});
