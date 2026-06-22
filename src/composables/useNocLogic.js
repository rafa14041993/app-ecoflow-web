import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

export function useNocLogic() {
  const SERVER_IP = '10.3.49.170' 
  const BASE_URL = `http://${SERVER_IP}:8000`

  const pestanaActiva = ref('monitoreo')
  const nodos = ref({})
  const conexionStatus = ref('Desconectado')
  let ws = null

  const modalVisible = ref(false)
  const proposito2FA = ref('control')
  const nodoSeleccionado = ref('')
  const accesoDesbloqueado = ref(false)
  const esperandoPin = ref(false)
  const pinIngresado = ref('')
  const loadingControl = ref(false)

  const estadoAC = ref(false)
  const estadoDC = ref(false)

  const rutasTelegram = ref([])
  const loadingTelegram = ref(false)
  const nuevaRuta = ref({ nombre_ruta: '', bot_token: '', chat_id: '' })

  const llavesBloqueadas = ref(true)
  const accessKey = ref('')
  const secretKey = ref('')
  const guardandoEcoFlow = ref(false)

  const daemonActivo = ref(false)
  const verificandoDaemon = ref(true)
  const procesandoOrden = ref(false)

  const telegramGlobalId = ref(null)
  const telegramSeguridadId = ref(null)

  const listaNodosConfig = ref([])
  const modalConfigNodoVisible = ref(false)
  const nodoConfigActual = ref({ sn: '', alias: '', ip: '', ip_alarma: '', telegram_ids: [] })

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

  const abrirModalControl = (alias) => {
    proposito2FA.value = 'control'
    nodoSeleccionado.value = alias
    accesoDesbloqueado.value = false
    esperandoPin.value = false
    pinIngresado.value = ''
    modalVisible.value = true
  }

  const solicitarDesbloqueoLlaves = () => {
    proposito2FA.value = 'llaves'
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
        if(proposito2FA.value === 'control') obtenerEstadoReal()
        if(proposito2FA.value === 'llaves') { llavesBloqueadas.value = false; cerrarModal() }
      } else esperandoPin.value = true
    } catch (error) { alert("Error de comunicación") }
    loadingControl.value = false
  }

  const verificarPin = async () => {
    if (pinIngresado.value.length < 6) return
    loadingControl.value = true
    try {
      const res = await axios.post(`${BASE_URL}/api/security/verify-2fa`, { code: pinIngresado.value })
      if (res.data.status === 'success') {
        accesoDesbloqueado.value = true
        if(proposito2FA.value === 'control') obtenerEstadoReal()
        if(proposito2FA.value === 'llaves') { llavesBloqueadas.value = false; cerrarModal() }
      } else {
        alert("PIN Incorrecto")
        pinIngresado.value = ''
      }
    } catch (error) { alert("Error al verificar el código") }
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
    } catch (error) { console.error("Error obteniendo estado") }
    loadingControl.value = false
  }

  const enviarComando = async (puerto, estadoNuevo) => {
    try {
      await axios.post(`${BASE_URL}/api/control/toggle`, {
        nodo_id: nodoSeleccionado.value, puerto: puerto, estado: estadoNuevo ? 1 : 0
      })
    } catch (error) {
      alert(`Error al enviar comando`)
      if(puerto === 'ac') estadoAC.value = !estadoNuevo
      if(puerto === 'dc') estadoDC.value = !estadoNuevo
    }
  }

  const cargarRutasTelegram = async () => {
    loadingTelegram.value = true
    try {
      const res = await axios.get(`${BASE_URL}/api/telegram/rutas`)
      rutasTelegram.value = res.data
    } catch (error) { console.error("Error cargando rutas") }
    loadingTelegram.value = false
  }

  const agregarRutaTelegram = async () => {
    if (!nuevaRuta.value.nombre_ruta || !nuevaRuta.value.bot_token || !nuevaRuta.value.chat_id) return alert("Llena todos los campos")
    try {
      const res = await axios.post(`${BASE_URL}/api/telegram/rutas`, nuevaRuta.value)
      if (res.data.status === 'success') {
        alert("Ruta agregada")
        nuevaRuta.value = { nombre_ruta: '', bot_token: '', chat_id: '' }
        cargarRutasTelegram()
      }
    } catch (error) { alert("Error al guardar") }
  }

  const eliminarRutaTelegram = async (id) => {
    if (!confirm("¿Eliminar este canal?")) return
    try {
      const res = await axios.delete(`${BASE_URL}/api/telegram/rutas/${id}`)
      if (res.data.status === 'success') cargarRutasTelegram()
    } catch (error) { alert("Error al eliminar") }
  }

  const cargarConfigEcoFlow = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/config/ecoflow`)
      if (res.status === 200) {
        accessKey.value = res.data.access_key || ''
        secretKey.value = res.data.secret_key || ''
        telegramGlobalId.value = res.data.telegram_global_id
        telegramSeguridadId.value = res.data.telegram_seguridad_id
      }
    } catch (error) { console.error("Error cargando config ecoflow") }
  }

  const guardarConfigEcoFlow = async () => {
    guardandoEcoFlow.value = true
    try {
      await axios.post(`${BASE_URL}/api/config/ecoflow`, {
        access_key: accessKey.value.trim(),
        secret_key: secretKey.value.trim()
      })
      alert("✅ Llaves guardadas correctamente")
      llavesBloqueadas.value = true
    } catch (error) { alert("Error guardando llaves") }
    guardandoEcoFlow.value = false
  }

  const checkDaemonStatus = async () => {
    verificandoDaemon.value = true
    try {
      const res = await axios.get(`${BASE_URL}/api/system/daemon/status`)
      if (res.status === 200) daemonActivo.value = res.data.active || false
    } catch (error) { console.error("Error verificando demonio") }
    verificandoDaemon.value = false
  }

  const controlarDaemon = async (accion) => {
    procesandoOrden.value = true
    try {
      const res = await axios.post(`${BASE_URL}/api/system/daemon/${accion}`)
      if (res.status === 200 && res.data.status === 'success') {
        alert(`✅ ${res.data.message}`)
        setTimeout(checkDaemonStatus, 2000)
      } else {
        alert(`❌ Error: ${res.data.message}`)
      }
    } catch (error) { alert("Error orden demonio") }
    procesandoOrden.value = false
  }

  const asignarTelegramRol = async (tipo, id) => {
    try {
      await axios.post(`${BASE_URL}/api/config/telegram_global`, { id_telegram: id || 0, tipo: tipo })
      if (tipo === 'global') telegramGlobalId.value = id
      else telegramSeguridadId.value = id
    } catch (error) { alert("Error asignando rol") }
  }

  const cargarListaNodos = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/nodos/listar`)
      if (res.status === 200) listaNodosConfig.value = res.data
    } catch (error) { console.error("Error cargando nodos config") }
  }

  const abrirModalConfigNodo = (nodo) => {
    nodoConfigActual.value = { ...nodo, telegram_ids: [...(nodo.telegram_ids || [])] }
    modalConfigNodoVisible.value = true
  }

  const cerrarModalConfigNodo = () => modalConfigNodoVisible.value = false

  const guardarConfigNodo = async () => {
    try {
      await axios.put(`${BASE_URL}/api/nodos/${nodoConfigActual.value.sn}/config`, {
        ip_monitoreo: nodoConfigActual.value.ip,
        ip_alarma: nodoConfigActual.value.ip_alarma,
        telegram_ids: nodoConfigActual.value.telegram_ids
      })
      cerrarModalConfigNodo()
      cargarListaNodos()
    } catch (error) { alert("Error configurando nodo") }
  }

  onMounted(() => { 
    conectarWebSocket()
    cargarRutasTelegram()
    cargarConfigEcoFlow()
    checkDaemonStatus()
    cargarListaNodos()
  })
  
  onUnmounted(() => { if (ws) ws.close() })

  return {
    pestanaActiva, nodos, conexionStatus, modalVisible, proposito2FA, nodoSeleccionado, accesoDesbloqueado, 
    esperandoPin, pinIngresado, loadingControl, estadoAC, estadoDC, rutasTelegram, loadingTelegram, nuevaRuta,
    llavesBloqueadas, accessKey, secretKey, guardandoEcoFlow, daemonActivo, verificandoDaemon, procesandoOrden,
    telegramGlobalId, telegramSeguridadId, listaNodosConfig, modalConfigNodoVisible, nodoConfigActual,
    abrirModalControl, solicitarDesbloqueoLlaves, cerrarModal, solicitarAcceso, verificarPin, enviarComando, 
    agregarRutaTelegram, eliminarRutaTelegram, guardarConfigEcoFlow, controlarDaemon, asignarTelegramRol,
    abrirModalConfigNodo, cerrarModalConfigNodo, guardarConfigNodo
  }
}