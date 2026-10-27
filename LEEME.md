# Trivia — versión web para móvil

Versión en HTML/JavaScript de `trivia_completa` que funciona en el móvil (y también en tablet y ordenador).
La lógica es la misma que en PsychoPy: clasificación 1–6 con cuotas (60 difíciles + 15 fáciles),
6 preguntas de práctica, 2 bloques de 30 con 15 ayudas de ChatGPT y cuota obligatoria, monedas y penalización,
descanso de 2–5 min, tarea de puntos (30 ensayos) y test de memoria (45 preguntas, 240 s después de la última exposición).

## Qué cambia respecto a PsychoPy

| PsychoPy | Versión móvil |
|---|---|
| Teclas 1–6 | Seis botones con el texto de la escala |
| Teclas 1–4 | Se tocan las cajas de las opciones |
| ESPACIO para consultar ChatGPT | Botón «💬 Consultar ChatGPT» |
| ESPACIO / cualquier tecla para avanzar | Botón «Continuar» |
| Captura de ChatGPT 1920×1080 | Respuesta transcrita en una caja tipo chat (en vertical la captura sería ilegible). Se puede volver a la imagen con `GPT_MODO: "imagen"` en `js/config.js` |
| Clic con ratón en los círculos | Toque; la zona táctil mide al menos 56 px aunque el círculo dibujado es igual de pequeño |
| Instrucciones de puntos como imágenes (ratón, barra espaciadora) | Mismo texto en HTML, adaptado a pantalla táctil |

En ordenador se siguen pudiendo usar las teclas (1–6, 1–4, espacio).

## Datos

Se genera **un CSV por participante con las mismas columnas que el de Pavlovia**, así que `clean.py` funciona igual
(probado). Columnas nuevas que puedes aprovechar:

- `dispositivo` (movil/tablet/ordenador), `OS`, `userAgent`, `pantalla_px`, `ventana_px`, `tactil`, `frameRate` (medido)
- `salidas_pagina` y `tiempo_fuera_s`: veces y segundos acumulados que el participante salió de la página (llamada, cambio de app…)
- `respuesta_modo` y `*.modo`: si se respondió tocando (`touch`), con ratón (`mouse`) o con teclado
- `puntos_onsets_fotogramas_ms` y `puntos_nube_real_media_ms`: duración real de cada nube de puntos (deberían ser ~80 ms)
- `gpt_modo`: texto o imagen

El participante se toma de la URL (`?participant=XXX`, también `PROLIFIC_PID` o `id`); si no viene, se genera uno aleatorio.

### Dónde se guardan

1. **Para recoger datos de verdad** (recomendado): crea un experimento gratuito en **DataPipe** (https://pipe.jspsych.org),
   enlazado a un proyecto de OSF, activa «data collection» y copia su ID en `DATAPIPE_ID` de `js/config.js`.
   Cada participante deja su CSV en el OSF. Si el móvil pierde conexión al final, se ofrece reintentar o descargar el archivo.
   Si alguien cierra la página a mitad, la próxima vez que se abra en ese mismo navegador se envía lo hecho como `..._INCOMPLETO.csv`.
2. **Sin `DATAPIPE_ID`** (modo prueba): al terminar se descarga el CSV en el propio dispositivo.

## Cómo publicarlo (gratis)

Sube **toda la carpeta `trivia_movil`** a cualquier alojamiento de páginas estáticas, por ejemplo:

- **GitHub Pages**: crea un repositorio, sube la carpeta y activa Pages (Settings → Pages). Enlace tipo `https://usuario.github.io/trivia_movil/`
- **Netlify Drop**: arrastra la carpeta a https://app.netlify.com/drop
- **Pavlovia** también sirve para alojar HTML propio, pero entonces el guardado lo haría DataPipe igualmente.

Después manda el enlace a los participantes (por ejemplo `https://.../index.html?participant=P001`).

## Probarlo rápido

- Abre `index.html?rapido=1` → todos los tiempos 20 veces más cortos (no usar con participantes).
- Abre `index.html?rapido=1&auto=1` → además responde solo; en ~3 min tienes un CSV completo para probar `clean.py`.

Para probarlo en local hace falta un servidor (no basta con doble clic), p. ej. en esta carpeta: `python -m http.server`
y luego `http://localhost:8000` (desde el móvil, con la IP del ordenador en la misma wifi).

## Archivos

- `index.html` – página de entrada
- `js/config.js` – **lo único que normalmente hay que tocar** (DataPipe, modo de ChatGPT, URL final)
- `js/logica.js` – cuotas, bloques, monedas, puntos y memoria (traducción directa del código de PsychoPy; aquí están DURACION_*, N_BLOQUES, etc.)
- `js/experimento.js` – pantallas, tiempos, registro de datos y guardado
- `materiales/` – Excel originales, `respuestas_chatgpt.csv` (transcripción de las capturas, revisable) y `materiales.js` (generado)
- `herramientas/generar_materiales.py` – regenera `materiales.js` si cambias los Excel o corriges el CSV de ChatGPT
- `IMAGES/` – las mismas imágenes del proyecto de PsychoPy

## Pendiente de revisar por el equipo

- La transcripción de las respuestas de ChatGPT (`materiales/respuestas_chatgpt.csv`). La columna
  `contiene_respuesta_correcta` = 0 marca las que no repiten literalmente la opción correcta; casi todas son paráfrasis,
  pero en algunas ChatGPT da otra respuesta (p. ej. calamar colosal / gigante, Corea del Sur / del Norte, Jesse Owens),
  igual que en las capturas originales.
- En iPhone no se puede forzar la pantalla completa; se recomienda hacer la tarea con el móvil en vertical.
