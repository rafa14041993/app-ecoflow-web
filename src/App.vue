<script setup>
// Importamos la pantalla que acabamos de crear
import PanelNoc from './components/PanelNoc.vue'
</script>

<template>
  <PanelNoc />
</template>

<style>
/* Quitamos los márgenes por defecto del navegador para que se vea a pantalla completa */
body {
  margin: 0;
  padding: 0;
  background-color: #121212; /* Fondo oscuro por si acaso */
}
</style>