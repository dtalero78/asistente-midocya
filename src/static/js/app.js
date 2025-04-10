// MIDOCYA ✅

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
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

// Funciones

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

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatCallSummary(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `Call Duration: ${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${remainingSeconds}s`;
}

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

async function startCall() {
    ringBox.style.display = 'block';
    callStatus.textContent = 'Llamando...';
    startBeeping();
    endCallBtn.disabled = true;
    await initOpenAIRealtime();
}

const fns = {
    sendEmail: async ({ message }) => {
        try {
            resumenGlobal = message;
            endCallBtn.style.display = 'block';

            await sendEmail(message);

            const to = "573008021701";
            await sendTextMessage(to, message);

            endCall();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    guardarHistoria: async (data) => {
        await guardarHistoria(data);
        return { success: true };
    }
};

async function guardarHistoria(data) {
    try {
        const response = await fetch('/guardar-historia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            console.log("📥 Historia guardada con ID:", result.id);
        } else {
            console.error("❌ Error guardando historia:", result.error);
        }
    } catch (err) {
        console.error("❌ Error al conectar con el backend:", err);
    }
}

async function sendEmail(message) {
    const loader = document.querySelector('.loader');
    loader.style.display = 'block';

    try {
        const response = await fetch('/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (response.ok) {
            showNotification('Email sent successfully!', 'success');
        } else {
            showNotification('Failed to send email', 'error');
        }
    } catch (error) {
        showNotification('Error sending email', 'error');
    } finally {
        loader.style.display = 'none';
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function sendTextMessage(toNumber, messageBody) {
    const url = "https://gate.whapi.cloud/messages/text";
    const headers = {
        "accept": "application/json",
        "authorization": "Bearer due3eWCwuBM2Xqd6cPujuTRqSbMb68lt",
        "content-type": "application/json"
    };
    const postData = {
        "typing_time": 0,
        "to": toNumber,
        "body": messageBody
    };
    return fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(postData)
    })
        .then(response => response.json())
        .then(json => {
            console.log("📤 Enviado por WhatsApp:", json);
            return json;
        })
        .catch(err => console.error("❌ Error enviando por WhatsApp:", err));
}

async function initOpenAIRealtime() {
    try {
        const tokenResponse = await fetch("session");
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.client_secret.value;

        peerConnection = new RTCPeerConnection();

        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'connected') {
                stopBeeping();
                isConnected = true;
                callStatus.textContent = 'Connected';
                timer.style.display = 'block';
                speakNow.style.display = 'block';
                startTimer();
                endCallBtn.style.display = 'none';
            }
        };

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        peerConnection.ontrack = event => {
            audioElement.srcObject = event.streams[0];
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection.addTrack(mediaStream.getTracks()[0]);

        dataChannel = peerConnection.createDataChannel('response');

        function configureData() {
            const event = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    tools: [
                        {
                            type: 'function',
                            name: 'sendEmail',
                            description: 'Envía un resumen por correo cuando el paciente se despida',
                            parameters: {
                                type: 'object',
                                properties: {
                                    message: {
                                        type: 'string',
                                        description: 'Contenido del resumen en texto'
                                    }
                                },
                                required: ['message']
                            }
                        },
                        {
                            type: 'function',
                            name: 'guardarHistoria',
                            description: 'Guarda los datos del paciente en la base de datos',
                            parameters: {
                                type: 'object',
                                properties: {
                                    nombre: { type: 'string' },
                                    edad: { type: 'string' },
                                    sexo: { type: 'string' },
                                    nacimiento: { type: 'string' },
                                    documento: { type: 'string' },
                                    estado_civil: { type: 'string' },
                                    ocupacion: { type: 'string' },
                                    direccion: { type: 'string' },
                                    ciudad: { type: 'string' },
                                    eps: { type: 'string' },
                                    enfermedades: { type: 'string' },
                                    hospitalizaciones: { type: 'string' },
                                    medicamentos: { type: 'string' },
                                    alergias: { type: 'string' }
                                },
                                required: ['nombre', 'edad']
                            }
                        }
                    ]
                }
            };
            dataChannel.send(JSON.stringify(event));
        }

        dataChannel.addEventListener('open', async () => {
            console.log('✅ Data channel opened');
            configureData();
        
            const patientId = getQueryParam('_id');
            let instruccionesYaEnviadas = false;
        
            if (patientId) {
                try {
                    const res = await fetch(`/historia/${patientId}`);
                    const json = await res.json();
        
                    if (json.success && json.historia) {
                        const historia = json.historia;
                        const nombreCompleto = historia.nombre || 'paciente';
                        const primerNombre = nombreCompleto.split(" ")[0];
                    
                        console.log(`🎙️ Paciente identificado: ${nombreCompleto} (ID ${patientId})`);
                    
                        const contextoHistoria = `
                    Historial médico de ${primerNombre}:
                    - Edad: ${historia.edad}
                    - Sexo: ${historia.sexo}
                    - Fecha de nacimiento: ${historia.nacimiento}
                    - Documento de identidad: ${historia.documento}
                    - Estado civil: ${historia.estado_civil}
                    - Ocupación: ${historia.ocupacion}
                    - Dirección: ${historia.direccion}
                    - Ciudad: ${historia.ciudad}
                    - EPS: ${historia.eps}
                    - Enfermedades importantes: ${historia.enfermedades}
                    - Hospitalizaciones o cirugías: ${historia.hospitalizaciones}
                    - Medicamentos actuales: ${historia.medicamentos}
                    - Alergias: ${historia.alergias}
                        `;
                    
                        const customInstructions = `
                    Eres un asistente médico de Mi Doc Ya para atender requerimientos médicos de ${nombreCompleto}.
                    NUNCA RESPONDAS PREGUNTAS QUE NO TIENEN QUE VER CON SALUD.
                    Tu tarea es ayudar a ${primerNombre} a resolver sus dudas y necesidades médicas.
                    
                    Puedes hacer preguntas para obtener más información y guiar a ${primerNombre} en el proceso.
                    ${contextoHistoria}
                    Saluda siempre: Hola ${primerNombre}, soy tu asistente de Mi Doc Ya. ¿En qué puedo ayudarte hoy ${primerNombre}?
                    Si el paciente pregunta otras cosas diferentes a salud, responde: "Lo siento, no puedo ayudarte con eso. Soy un asistente médico y solo puedo ayudarte con temas de salud".
                    Si crees que la pregunta amerita consultar con un médico, NUNCA digas que debe consultar con un médico sino que si quiere que le agendemos una consulta con uno de nuestros médicos
                        `;
                    
                        dataChannel.send(JSON.stringify({
                            type: "session.update",
                            session: { instructions: customInstructions }
                        }));
                    
                        instruccionesYaEnviadas = true;
                    }
                    
                } catch (e) {
                    console.warn("⚠️ No se pudo obtener la historia del paciente:", e);
                }
            }
        
            if (!instruccionesYaEnviadas) {
                const systemInstructions = `
        Eres un asistente médico de MiDocYa. Vas a abrir la historia clínica de este paciente y para eso vas a hacerle las siguientes preguntas, una por una, esperando su respuesta antes de pasar a la siguiente:
        
        - Nombre completo
        - Edad
        - Sexo
        - Fecha de nacimiento
        - Documento de identidad
        - Estado civil
        - Ocupación
        - Dirección y teléfono
        - Ciudad de residencia
        - EPS o seguro médico
        - ¿Ha tenido alguna enfermedad importante?
        - ¿Ha sido hospitalizado o ha tenido cirugías?
        - ¿Toma medicamentos actualmente?
        - ¿Es alérgico a algún medicamento o alimento?
        
        Al finalizar la entrevista:
        
        1. Crea un objeto JSON con todos los datos recolectados y llama a la función:
        
        guardarHistoria({
          nombre: "...",
          edad: "...",
          sexo: "...",
          nacimiento: "...",
          documento: "...",
          estado_civil: "...",
          ocupacion: "...",
          direccion: "...",
          ciudad: "...",
          eps: "...",
          enfermedades: "...",
          hospitalizaciones: "...",
          medicamentos: "...",
          alergias: "..."
        })
        
        2. Luego, genera un resumen textual y llama a:
        
        sendEmail({ message: "Aquí va el resumen clínico completo..." })
                `;
                dataChannel.send(JSON.stringify({
                    type: "session.update",
                    session: { instructions: systemInstructions }
                }));
            }
        });
        

        dataChannel.addEventListener('message', async (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'response.function_call_arguments.done') {
                    const fn = fns[msg.name];
                    if (fn !== undefined) {
                        const args = JSON.parse(msg.arguments);
                        const result = await fn(args);
                        const event = {
                            type: 'conversation.item.create',
                            item: {
                                type: 'function_call_output',
                                call_id: msg.call_id,
                                output: JSON.stringify(result)
                            }
                        };
                        dataChannel.send(JSON.stringify(event));
                    }
                }
            } catch (error) {
                console.error('❌ Error manejando mensaje:', error);
            }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const apiUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";

        const sdpResponse = await fetch(`${apiUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            },
        });

        const answer = {
            type: "answer",
            sdp: await sdpResponse.text(),
        };
        await peerConnection.setRemoteDescription(answer);

    } catch (error) {
        console.error("❌ Error en initOpenAIRealtime:", error);
        endCall();
    }
}


// Eventos
callButton.addEventListener('click', startCall);
endCallBtn.addEventListener('click', async () => {
    if (resumenGlobal) {
        console.log("📨 Enviando resumen antes de finalizar...");
        await fns.sendEmail({ message: resumenGlobal });
    } else {
        console.warn("⚠️ No hay resumen para enviar.");
    }
    endCall();
});
