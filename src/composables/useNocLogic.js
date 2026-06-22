import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

export function useNocLogic() {
  // IP de tu servidor backend en Linux
  const SERVER_IP = '10.3.49.170' 
  const BASE_URL = `http://${SERVER_IP}:8000`

  // --- CONTROL DE PESTAÑAS ---
  const pestanaActiva = ref('monitoreo')

  // --- ESTADOS DE TELEMETRÍA ---
  const nodos = ref({})
  const conexionStatus = ref('Desconectado')
  let ws = null

  // --- ESTADOS PARA EL PANEL DE CONTROL 2FA ---
  const modalVisible = ref(false)
  const nodoSeleccionado = ref('')
  const accesoDesbloqueado = ref(false)
  const esperandoPin = ref(false)
  const pinIngresado = ref('')
  const loadingControl = ref(false)
  const estadoAC = ref(false)
  const estadoDC = ref(false)

  // --- ESTADOS PARA GESTIÓN DE TELEGRAM ---
  const rutasTelegram = ref([])
  const loadingTelegram = ref(false)
  const nuevaRuta = ref({
    nombre_ruta: '',
    bot_token: '',
    chat_id: ''
  })

  // --- LÓGICA WEBSOCKETS (Telemetría) ---
  const conectarWebSocket = () => {
    ws = new WebSocket(`ws://${SERVER_IP}:8000/ws/live`)
    ws.onopen = () => conexionStatus.value = 'Conectado'
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      if (payload.event === 'initial_state') nodos.value = payload.data
      else if (payload.event === 'telemetry_update') nodos.value[payload.data.nodo_id] = payload.data
    }
    ws.onclose = () => {
      conexionStatus.value = 'Desconectado'
      setTimeout(conectarWebSocket, 5000)
    }
  }

  // --- LÓGICA DE CONTROL REMOTO ---
  const abrirModalControl = (alias) => {
    nodoSeleccionado.value = alias
    accesoDesbloqueado.value = false
    esperandoPin.value = false
    pinIngresado.value = ''
    modalVisible.value = true
  }
  
  const cerrarModal = () => modalVisible.value = false

  const solicitarAcceso = async () => {
    loadingControl.value = true
    try {
      const res = await axios.post(`${BASE_URL}/api/security/request-2fa`)
      if (res.data.bypass) {
        accesoDesbloqueado.value = true
        obtenerEstadoReal()
      } else {
        esperandoPin.value = true
      }
    } catch (error) { 
      alert("Error de comunicación con el servidor de seguridad.") 
    }
    loadingControl.value = false
  }

  const verificarPin = async () => {
    if (pinIngresado.value.length < 6) return
    loadingControl.value = true
    try {
      const res = await axios.post(`${BASE_URL}/api/security/verify-2fa`, { code: pinIngresado.value })
      if (res.data.status === 'success') {
        accesoDesbloqueado.value = true
        obtenerEstadoReal()
      } else {
        alert("PIN Incorrecto o expirado.")
        pinIngresado.value = ''
      }
    } catch (error) { 
      alert("Error al verificar el código.") 
    }
    loadingControl.value = false
  }

  const obtenerEstadoReal = async () => {
    loadingControl.value = true
    try {
      const res = await axios.get(`${BASE_URL}/api/control/status/${nodoSeleccionado.value}`)
      if (res.data.status === 'success') {
        estadoAC.value = res.data.ac
        estadoDC.value = res.data.dc
      }
    } catch (error) { 
      console.error("Error obteniendo estado de puertos") 
    }
    loadingControl.value = false
  }

  const enviarComando = async (puerto, estadoNuevo) => {
    try {
      await axios.post(`${BASE_URL}/api/control/toggle`, {
        nodo_id: nodoSeleccionado.value,
        puerto: puerto,
        estado: estadoNuevo ? 1 : 0
      })
    } catch (error) {
      alert(`Error al enviar comando al puerto ${puerto.toUpperCase()}`)
      if(puerto === 'ac') estadoAC.value = !estadoNuevo
      if(puerto === 'dc') estadoDC.value = !estadoNuevo
    }
  }

  // --- LÓGICA DE TELEGRAM ---
  const cargarRutasTelegram = async () => {
    loadingTelegram.value = true
    try {
      const res = await axios.get(`${BASE_URL}/api/telegram/rutas`)
      rutasTelegram.value = res.data
    } catch (error) { 
      console.error("Error cargando rutas de Telegram") 
    }
    loadingTelegram.value = false
  }

  const agregarRutaTelegram = async () => {
    if (!nuevaRuta.value.nombre_ruta || !nuevaRuta.value.bot_token || !nuevaRuta.value.chat_id) {
      alert("Por favor, llena todos los campos.")
      return
    }
    try {
      const res = await axios.post(`${BASE_URL}/api/telegram/rutas`, nuevaRuta.value)
      if (res.data.status === 'success') {
        alert("Ruta de Telegram agregada con éxito.")
        nuevaRuta.value = { nombre_ruta: '', bot_token: '', chat_id: '' }
        cargarRutasTelegram()
      }
    } catch (error) { 
      alert("Error al guardar la ruta.") 
    }
  }

  const eliminarRutaTelegram = async (id) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este canal de Telegram?")) return
    try {
      const res = await axios.delete(`${BASE_URL}/api/telegram/rutas/${id}`)
      if (res.data.status === 'success') {
        cargarRutasTelegram()
      }
    } catch (error) { 
      alert("Error al eliminar la ruta.") 
    }
  }

  // --- CICLO DE VIDA ---
  onMounted(() => {
    conectarWebSocket()
    cargarRutasTelegram()
  })
  
  onUnmounted(() => { 
    if (ws) ws.close() 
  })

  // Retornamos TODO lo que la vista necesita leer o ejecutar
  return {
    pestanaActiva,
    nodos,
    conexionStatus,
    modalVisible,
    nodoSeleccionado,
    accesoDesbloqueado,
    esperandoPin,
    pinIngresado,
    loadingControl,
    estadoAC,
    estadoDC,
    rutasTelegram,
    loadingTelegram,
    nuevaRuta,
    abrirModalControl,
    cerrarModal,
    solicitarAcceso,
    verificarPin,
    enviarComando,
    agregarRutaTelegram,
    eliminarRutaTelegram
  }
}