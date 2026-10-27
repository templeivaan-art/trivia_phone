// =====================================================================
//  CONFIGURACIÓN DE LA VERSIÓN WEB / MÓVIL
//  Es el único archivo que normalmente necesitarás tocar.
// =====================================================================
window.CONFIG = {
  // Nombre del experimento (aparece en la columna expName y en el nombre del CSV).
  EXP_NAME: "trivia_movil",

  // ID de DataPipe (https://pipe.jspsych.org) para guardar los CSV en OSF.
  // Si se deja vacío, al terminar se descarga el CSV en el dispositivo
  // (útil para pilotar, NO para recoger datos de participantes).
  DATAPIPE_ID: "h1DdaiKnzFMP",

  // Cómo se muestra la ayuda de ChatGPT:
  //   "texto"  -> respuesta transcrita en una caja tipo chat (legible en móvil)
  //   "imagen" -> la captura original 1920x1080 (solo recomendable en ordenador)
  GPT_MODO: "texto",

  // Pedir pantalla completa al empezar (funciona en Android y ordenador; iPhone no lo permite).
  PANTALLA_COMPLETA: true,

  // Opcional: dirección a la que se redirige al terminar (p. ej. código de Prolific/SONA).
  URL_FINAL: "",

  // Correo de contacto que se muestra si los datos no se pueden enviar.
  CORREO_CONTACTO: "",
};
