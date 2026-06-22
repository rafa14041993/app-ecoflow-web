<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

// IP de tu servidor backend en Linux
const SERVER_IP = '10.3.49.170' 
const BASE_URL = `http://${SERVER_IP}:8000`

// --- CONTROL DE PESTAÑAS (NUEVO) ---
const pestanaActiva = ref('monitoreo') // 'monitoreo' o 'telegram'

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

// --- ESTADOS PARA GESTIÓN DE TELEGRAM (NUEVO) ---
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
  } catch (error) { alert("Error de comunicación con el servidor de seguridad.") }
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
  } catch (error) { alert("Error al verificar el código.") }
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
  } catch (error) { console.error("Error obteniendo estado de puertos") }
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

// --- LÓGICA DE TELEGRAM (NUEVO) ---
const cargarRutasTelegram = async () => {
  loadingTelegram.value = true
  try {
    const res = await axios.get(`${BASE_URL}/api/telegram/rutas`)
    rutasTelegram.value = res.data
  } catch (error) { console.error("Error cargando rutas de Telegram") }
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
      nuevaRuta.value = { nombre_ruta: '', bot_token: '', chat_id: '' } // Limpiar formulario
      cargarRutasTelegram() // Recargar lista
    }
  } catch (error) { alert("Error al guardar la ruta.") }
}

const eliminarRutaTelegram = async (id) => {
  if (!confirm("¿Estás seguro de que deseas eliminar este canal de Telegram?")) return
  try {
    const res = await axios.delete(`${BASE_URL}/api/telegram/rutas/${id}`)
    if (res.data.status === 'success') {
      cargarRutasTelegram()
    }
  } catch (error) { alert("Error al eliminar la ruta.") }
}

onMounted(() => {
  conectarWebSocket()
  cargarRutasTelegram()
})
onUnmounted(() => { if (ws) ws.close() })
</script>

<template>
  <div class="min-h-screen bg-[#121212] text-white p-6 font-sans">
    
    <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-gray-800 pb-4 gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        </div>
        <div>
          <h1 class="text-2xl font-bold tracking-wider text-gray-100">NOC ECOFLOW</h1>
          <p class="text-xs text-gray-500 uppercase tracking-widest">Centro de Control de Energía</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4 w-full sm:w-auto">
        <div class="bg-[#1E1E1E] p-1 rounded-xl border border-gray-800 flex gap-1">
          <button @click="pestanaActiva = 'monitoreo'" :class="pestanaActiva === 'monitoreo' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'" class="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer">
            📊 Monitoreo
          </button>
          <button @click="pestanaActiva = 'telegram'" :class="pestanaActiva === 'telegram' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'" class="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer">
            📢 Telegram
          </button>
        </div>

        <div class="flex items-center gap-2 bg-[#1E1E1E] px-4 py-2 rounded-xl border border-gray-800">
          <span class="relative flex h-3 w-3">
            <span v-if="conexionStatus === 'Conectado'" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span :class="conexionStatus === 'Conectado' ? 'bg-emerald-500' : 'bg-red-500'" class="relative inline-flex rounded-full h-3 w-3"></span>
          </span>
          <span class="text-sm font-semibold" :class="conexionStatus === 'Conectado' ? 'text-emerald-400' : 'text-red-400'">
            {{ conexionStatus }}
          </span>
        </div>
      </div>
    </header>

    <div v-if="pestanaActiva === 'monitoreo'">
      <div v-if="Object.keys(nodos).length === 0" class="flex flex-col items-center justify-center mt-20 text-gray-500">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p>Esperando telemetría del servidor...</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        <div v-for="(datos, alias) in nodos" :key="alias" class="bg-[#1E1E1E] rounded-xl border border-gray-800 p-5 shadow-xl transition-all duration-300 hover:border-blue-500/50">
          <div class="flex justify-between items-center mb-5">
            <h2 class="text-lg font-bold text-gray-200 truncate pr-2">{{ alias }}</h2>
            <div class="flex gap-2">
              <span class="text-xs font-bold px-2 py-1 rounded bg-gray-800 text-gray-400 flex items-center">
                {{ datos.temperatura }}°C
              </span>
              <button @click="abrirModalControl(alias)" class="text-xs font-bold px-3 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30 transition-all cursor-pointer">
                ⚙️ Control
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="flex flex-col items-center justify-center p-3 rounded-lg bg-[#252525]">
              <span class="text-gray-400 text-xs mb-1">Batería</span>
              <span class="text-xl font-bold" :class="datos.bateria_soc < 30 ? 'text-red-400' : 'text-emerald-400'">
                {{ datos.bateria_soc }}%
              </span>
            </div>
            <div class="flex flex-col items-center justify-center p-3 rounded-lg bg-[#252525]">
              <span class="text-gray-400 text-xs mb-1">Red AC</span>
              <span class="text-xl font-bold text-blue-400">{{ datos.volts_entrada }}V</span>
            </div>
            <div class="flex flex-col items-center justify-center p-3 rounded-lg bg-[#252525]">
              <span class="text-gray-400 text-xs mb-1">Autonomía</span>
              <span class="text-xl font-bold text-amber-400">{{ datos.tiempo_restante }}m</span>
            </div>
          </div>

          <div class="flex justify-between items-center text-sm border-t border-gray-800 pt-4">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span class="text-gray-400">Entrada: <b class="text-white">{{ datos.potencia_entrada }}W</b></span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-purple-500"></div>
              <span class="text-gray-400">Salida: <b class="text-white">{{ datos.potencia_salida }}W</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="pestanaActiva === 'telegram'" class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
      
      <div class="bg-[#1E1E1E] rounded-xl border border-gray-800 p-6 shadow-xl h-fit">
        <h3 class="text-lg font-bold mb-1 text-gray-200">Registrar Nuevo Canal</h3>
        <p class="text-xs text-gray-500 mb-6">Agrega un bot para direccionar alertas de red</p>
        
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nombre de la Ruta / Alias</label>
            <input v-model="nuevaRuta.nombre_ruta" type="text" placeholder="Ej: Grupo Alertas Norte" class="w-full bg-[#252525] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bot Token de Telegram</label>
            <input v-model="nuevaRuta.bot_token" type="password" placeholder="123456789:ABCdefGhI..." class="w-full bg-[#252525] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono text-xs">
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Chat ID (Grupo / Canal)</label>
            <input v-model="nuevaRuta.chat_id" type="text" placeholder="Ej: -100123456789" class="w-full bg-[#252525] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono">
          </div>

          <button @click="agregarRutaTelegram" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-sm transition-all cursor-pointer shadow-lg shadow-blue-500/20 mt-2">
            ➕ Guardar Canal de Alerta
          </button>
        </div>
      </div>

      <div class="lg:col-span-2 bg-[#1E1E1E] rounded-xl border border-gray-800 p-6 shadow-xl">
        <h3 class="text-lg font-bold mb-1 text-gray-200">Canales de Alerta Activos</h3>
        <p class="text-xs text-gray-500 mb-6">Lista global de rutas configuradas en la base de datos</p>

        <div v-if="loadingTelegram" class="flex justify-center py-12 text-gray-500">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
          Cargando rutas de base de datos...
        </div>

        <div v-else-if="rutasTelegram.length === 0" class="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl">
          No hay canales de Telegram registrados todavía.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th class="pb-3">Nombre / Destino</th>
                <th class="pb-3 hidden sm:table-cell">Chat ID</th>
                <th class="pb-3 hidden md:table-cell">Token (Ofuscado)</th>
                <th class="pb-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800 text-sm">
              <tr v-for="ruta in rutasTelegram" :key="ruta.id" class="hover:bg-[#252525]/30 transition-all">
                <td class="py-3.5 font-bold text-gray-200">{{ ruta.nombre }}</td>
                <td class="py-3.5 font-mono text-xs text-amber-400 hidden sm:table-cell">{{ ruta.chat_id }}</td>
                <td class="py-3.5 font-mono text-xs text-gray-500 hidden md:table-cell">
                  {{ ruta.token ? ruta.token.substring(0, 9) + '...' : 'Sin Token' }}
                </td>
                <td class="py-3.5 text-right">
                  <button @click="eliminarRutaTelegram(ruta.id)" class="text-xs bg-red-600/10 hover:bg-red-600/30 text-red-400 border border-red-500/20 px-3 py-1 rounded-md font-medium transition-all cursor-pointer">
                    🗑️ Eliminar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <div v-if="modalVisible" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
        <button @click="cerrarModal" class="absolute top-4 right-4 text-gray-500 hover:text-white text-xl font-bold cursor-pointer">&times;</button>
        <h3 class="text-xl font-bold mb-1">Control: <span class="text-blue-400">{{ nodoSeleccionado }}</span></h3>
        <p class="text-sm text-gray-400 mb-6 border-b border-gray-800 pb-4">Gestión remota de puertos</p>

        <div v-if="!accesoDesbloqueado" class="flex flex-col items-center py-6">
          <div class="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-3xl">🔐</div>
          <h4 class="text-lg font-bold mb-2">Panel Bloqueado</h4>
          
          <div v-if="!esperandoPin" class="text-center">
            <p class="text-sm text-gray-500 mb-6">El control de energía requiere autorización.</p>
            <button @click="solicitarAcceso" :disabled="loadingControl" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold transition-all cursor-pointer disabled:opacity-50">
              {{ loadingControl ? 'Conectando...' : 'Solicitar Acceso' }}
            </button>
          </div>

          <div v-else class="text-center w-full px-8">
            <p class="text-sm text-gray-400 mb-4">Ingresa el código enviado a tu Telegram</p>
            <input v-model="pinIngresado" type="text" maxlength="6" class="w-full bg-[#252525] border border-gray-700 rounded-lg text-center text-2xl font-mono tracking-[0.5em] py-3 text-white focus:outline-none focus:border-blue-500 mb-4">
            <button @click="verificarPin" :disabled="loadingControl || pinIngresado.length < 6" class="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold transition-all cursor-pointer disabled:opacity-50">
               {{ loadingControl ? 'Verificando...' : 'Desbloquear' }}
            </button>
          </div>
        </div>

        <div v-else>
          <div v-if="loadingControl" class="flex flex-col items-center justify-center py-8">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
            <p class="text-gray-400">Obteniendo estado en vivo...</p>
          </div>

          <div v-else class="space-y-4">
            <div class="flex items-center justify-between bg-[#252525] p-4 rounded-xl border border-gray-800">
              <div>
                <h4 class="font-bold text-gray-200 text-lg">Inversor AC</h4>
                <p class="text-xs text-gray-500">Tomas de corriente (110V/220V)</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="estadoAC" @change="enviarComando('ac', estadoAC)" class="sr-only peer">
                <div class="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>

            <div class="flex items-center justify-between bg-[#252525] p-4 rounded-xl border border-gray-800">
              <div>
                <h4 class="font-bold text-gray-200 text-lg">Salida DC</h4>
                <p class="text-xs text-gray-500">Puertos USB y encendedor (12V)</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="estadoDC" @change="enviarComando('dc', estadoDC)" class="sr-only peer">
                <div class="w-14 h-7 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>