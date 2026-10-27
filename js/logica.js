// =====================================================================
//  LÓGICA DEL EXPERIMENTO (traducida 1:1 del código de trivia_completa.psyexp)
//  Selección de preguntas, cuotas, bloques, monedas, tarea de puntos y memoria.
// =====================================================================
(function () {
'use strict';

const P = new URLSearchParams(location.search);
// ?rapido=1 acorta todos los tiempos (solo para probar). Nunca usar con participantes.
const F = P.get('rapido') === '1' ? 0.05 : 1;

// ================= CONFIGURACION (idéntica a PsychoPy) =================
const CFG = {};
CFG.CATEGORIAS = ["conocimiento_bajo", "incertidumbre", "conocimiento_alto"];
// Clasificacion: 60 dificiles (conocimiento 1-2) para la trivia y 15 faciles (5-6)
// para el bloque de memoria. Las valoradas 3-4 no se usan.
CFG.CUOTAS = {"conocimiento_bajo": 60, "incertidumbre": 0, "conocimiento_alto": 15};
CFG.CATEGORIA_MEMORIA = "conocimiento_alto";
CFG.DISTRIBUCION_BLOQUES = [
    {"conocimiento_bajo": 30, "incertidumbre": 0, "conocimiento_alto": 0},
    {"conocimiento_bajo": 30, "incertidumbre": 0, "conocimiento_alto": 0}
];
CFG.N_BLOQUES = 2;
CFG.PREGUNTAS_POR_BLOQUE = 30;
CFG.AYUDAS_POR_BLOQUE = 15;
CFG.N_PRACTICA = 6;
CFG.AYUDAS_PRACTICA = 6;
CFG.ESCALA = "conocimiento_1_6";
// Trivia
CFG.DURACION_PREGUNTA = 5.0 * F;
CFG.DURACION_OPCIONES = 20.0 * F;
CFG.DURACION_FEEDBACK = 1.5 * F;
CFG.DURACION_SOLUCION = 1.0 * F;
CFG.MONEDAS_ACIERTO = 5;
CFG.MONEDAS_ERROR = -10;
CFG.DESCANSO_MINIMO = 120.0 * F;
CFG.DESCANSO_MAXIMO = 300.0 * F;
// Memoria
CFG.N_MEMORIA_CATEGORIA = 15;
CFG.MIN_INTERVALO_MEMORIA = 240.0 * F;
// Tarea de puntos (distractora)
CFG.N_ENSAYOS_PUNTOS = 30;
CFG.PUNTOS_FIJACION = 0.2;
CFG.PUNTOS_NUBE = 0.08;
CFG.COLUMNAS_PUNTOS = ["S1Pic", "S2Pic", "S3Pic", "S4Pic", "S5Pic", "S6Pic",
                       "S7Pic", "S8Pic", "S9Pic", "S10Pic", "mask"];
CFG.PUNTOS_INICIO_RESPUESTA = CFG.PUNTOS_FIJACION + CFG.COLUMNAS_PUNTOS.length * CFG.PUNTOS_NUBE;
CFG.PUNTOS_MAX_RESPUESTA = 1.5;
CFG.PUNTOS_FEEDBACK = 0.5;
CFG.FACTOR_TIEMPO = F;

const MENSAJES_RESULTADO = {"acierto": "Correcto (+" + String(CFG.MONEDAS_ACIERTO) + ")",
                            "error": "Incorrecto (" + String(CFG.MONEDAS_ERROR) + ")",
                            "omision": "Sin respuesta (" + String(CFG.MONEDAS_ERROR) + ")"};

const E = {};
let reloj = () => 0;   // lo fija experimento.js (segundos desde el inicio)

const C = CFG;  // alias corto

function normalizar(texto) {
    return String(texto).trim().toLowerCase().split(/\s+/).filter(function (x) { return x.length > 0; }).join(" ");
}
function entero(valor) { return Math.round(parseFloat(valor)); }
function categoria_conocimiento(valor) {
    const v = entero(valor);
    if (v <= 2) { return "conocimiento_bajo"; }
    if (v <= 4) { return "incertidumbre"; }
    return "conocimiento_alto";
}
function barajar(lista) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
}
function copiar(o) { return Object.assign({}, o); }
function primera_tecla(valor) {
    if (valor === undefined || valor === null) { return null; }
    if (Array.isArray(valor)) { if (valor.length === 0) { return null; } valor = valor[0]; }
    const texto = String(valor).trim();
    return texto.length === 0 ? null : texto;
}
function primer_rt(valor) {
    if (valor === undefined || valor === null) { return null; }
    if (Array.isArray(valor)) { if (valor.length === 0) { return null; } valor = valor[0]; }
    return parseFloat(valor);
}
function a_json(v) { return JSON.stringify(v); }
function formato_numero(v) { return String(Number(v)); }
function dos_digitos(n) { return (n < 10 ? "0" : "") + String(n); }
function formato_mmss(segundos) {
    const s = Math.floor(segundos);
    return dos_digitos(Math.floor(s / 60)) + ":" + dos_digitos(s % 60);
}
function registrar_inicio(nombre, t) { E["inicios"][nombre] = (t === undefined) ? reloj() : t; }
function registrar_fin_exposicion(ensayo, t) { ensayo["ultima_exposicion_fin"] = (t === undefined) ? reloj() : t; }

function preparar_pregunta(fila) {
    const ident = String(entero(fila["ID"]));
    return {"ID": ident, "Pregunta": String(fila["Pregunta"]).trim(),
            "Correct": String(fila["Correct"]).trim(),
            "A": String(fila["OptA"]).trim(), "B": String(fila["OptB"]).trim(),
            "C": String(fila["OptC"]).trim(), "D": String(fila["OptD"]).trim(),
            "Key": entero(fila["Key"]), "GPT": "IMAGES/" + String(fila["GPT_Image"]).trim(),
            "GPT_archivo": String(fila["GPT_Image"]).trim(),
            "sel_uid": "ID_" + ident};
}

function comprobar_configuracion() {
    let total = 0;
    for (const k of C.CATEGORIAS) {
        let suma = 0;
        for (const d of C.DISTRIBUCION_BLOQUES) { suma += d[k]; }
        if (k === C.CATEGORIA_MEMORIA) { suma += C.N_MEMORIA_CATEGORIA; }
        if (suma !== C.CUOTAS[k]) { throw new Error("DISTRIBUCION_BLOQUES + memoria no suma las CUOTAS de " + k); }
        total += C.CUOTAS[k];
    }
    if (C.DISTRIBUCION_BLOQUES.length !== C.N_BLOQUES
            || total !== C.N_BLOQUES * C.PREGUNTAS_POR_BLOQUE + C.N_MEMORIA_CATEGORIA) {
        throw new Error("Las cuotas no coinciden con N_BLOQUES x PREGUNTAS_POR_BLOQUE");
    }
    for (const d2 of C.DISTRIBUCION_BLOQUES) {
        let s = 0;
        for (const k2 of C.CATEGORIAS) { s += d2[k2]; }
        if (s !== C.PREGUNTAS_POR_BLOQUE) { throw new Error("Un bloque no tiene PREGUNTAS_POR_BLOQUE preguntas"); }
    }
}

function iniciar_estado(filas_banco, filas_practica, filas_puntos) {
    comprobar_configuracion();
    const practica = filas_practica.map(preparar_pregunta);
    const claves_practica = new Set(practica.map(function (p) { return normalizar(p["Pregunta"]); }));
    const banco = [];
    const claves = new Set();
    for (const f of filas_banco) {
        const p = preparar_pregunta(f);
        const c = normalizar(p["Pregunta"]);
        if (claves.has(c) || claves_practica.has(c)) { continue; }
        claves.add(c);
        banco.push(p);
    }
    if (filas_puntos.length < C.N_ENSAYOS_PUNTOS) {
        throw new Error("La tarea de puntos necesita al menos " + String(C.N_ENSAYOS_PUNTOS) + " filas");
    }
    E["banco"] = banco;
    E["orden_banco"] = barajar(banco);
    E["practica"] = barajar(practica).slice(0, C.N_PRACTICA);
    E["puntos"] = barajar(filas_puntos).slice(0, C.N_ENSAYOS_PUNTOS);
    E["valoraciones"] = [];
    E["conteos"] = {"conocimiento_bajo": 0, "incertidumbre": 0, "conocimiento_alto": 0};
    E["estado_clasificacion"] = "en_curso";
    E["inicios"] = {};
    E["fase"] = "clasificacion";
    E["monedas"] = 0;
    E["memory_bank"] = [];
    E["faciles_memoria"] = [];
    E["ayudas_restantes"] = 0;
    E["ayudas_totales"] = 0;
    E["bloque"] = 0;
    E["continuar"] = true;
}

// ---------------- Clasificacion ----------------
function seleccion_completa() {
    for (const k of C.CATEGORIAS) { if (E["conteos"][k] !== C.CUOTAS[k]) { return false; } }
    return true;
}

function valorar(pregunta, tecla, rt) {
    const valor = entero(primera_tecla(tecla));
    const nivel = categoria_conocimiento(valor);
    const incluida = E["conteos"][nivel] < C.CUOTAS[nivel];
    if (incluida) { E["conteos"][nivel] += 1; }
    E["valoraciones"].push({"pregunta": pregunta, "conocimiento": valor, "categoria": nivel, "incluida": incluida});
    // Se dejan sin valorar tantas preguntas como faciles falten.
    const sin_valorar = E["orden_banco"].length - E["valoraciones"].length;
    const faltan_faciles = C.CUOTAS[C.CATEGORIA_MEMORIA] - E["conteos"][C.CATEGORIA_MEMORIA];
    if (seleccion_completa()) {
        E["estado_clasificacion"] = "completa";
    } else if (sin_valorar <= faltan_faciles) {
        E["estado_clasificacion"] = "con_relleno";
    }
    return {"fase": "clasificacion", "sel_uid": pregunta["sel_uid"],
            "question_ID": pregunta["ID"], "question": pregunta["Pregunta"],
            "sel_orden_presentacion": E["valoraciones"].length,
            "sel_conocimiento": valor, "sel_escala": C.ESCALA, "sel_categoria": nivel,
            "sel_incluida": incluida ? 1 : 0, "sel_rt_s": primer_rt(rt),
            "sel_n_conocimiento_bajo": E["conteos"]["conocimiento_bajo"],
            "sel_n_incertidumbre": E["conteos"]["incertidumbre"],
            "sel_n_conocimiento_alto": E["conteos"]["conocimiento_alto"]};
}

function asignar_bloques(seleccion) {
    const grupos = {};
    for (const k of C.CATEGORIAS) {
        grupos[k] = barajar(seleccion.filter(function (v) { return v["plaza"] === k; }));
    }
    const distribuciones = barajar(C.DISTRIBUCION_BLOQUES);
    const bloques = [];
    for (let b = 0; b < distribuciones.length; b++) {
        let bloque = [];
        for (const k2 of C.CATEGORIAS) {
            const n = distribuciones[b][k2];
            for (const v of grupos[k2].slice(0, n)) {
                const e = copiar(v["pregunta"]);
                e["sel_conocimiento"] = v["conocimiento"];
                e["sel_categoria"] = v["categoria"];
                e["sel_relleno"] = v["relleno"];
                bloque.push(e);
            }
            grupos[k2] = grupos[k2].slice(n);
        }
        bloque = barajar(bloque);
        for (let i = 0; i < bloque.length; i++) {
            bloque[i]["Block"] = b + 1;
            bloque[i]["orden_bloque"] = i + 1;
        }
        bloques.push(bloque);
    }
    return bloques;
}

function cerrar_clasificacion() {
    const seleccion = [];
    const faciles = [];
    for (const v of E["valoraciones"]) {
        if (v["incluida"] && v["categoria"] === C.CATEGORIA_MEMORIA) {
            faciles.push(Object.assign(copiar(v), {"mem_categoria": "facil"}));
        } else if (v["incluida"]) {
            seleccion.push(Object.assign(copiar(v), {"plaza": v["categoria"], "relleno": 0}));
        }
    }
    // Si faltan preguntas para la trivia se usan las valoradas mas bajas que no se seleccionaron.
    let candidatas = barajar(E["valoraciones"].filter(function (x) { return !x["incluida"]; }));
    candidatas.sort(function (a, b) { return a["conocimiento"] - b["conocimiento"]; });
    let n_relleno_trivia = 0;
    for (const k of C.CATEGORIAS) {
        if (k === C.CATEGORIA_MEMORIA) { continue; }
        let necesarias = 0;
        for (const d of C.DISTRIBUCION_BLOQUES) { necesarias += d[k]; }
        const falta = Math.max(0, necesarias - seleccion.filter(function (x) { return x["plaza"] === k; }).length);
        for (const c of candidatas.slice(0, falta)) {
            seleccion.push(Object.assign(copiar(c), {"plaza": k, "relleno": 1}));
            n_relleno_trivia += 1;
        }
        candidatas = candidatas.slice(falta);
    }
    const vistas = new Set(E["valoraciones"].map(function (x) { return normalizar(x["pregunta"]["Pregunta"]); }));
    const no_presentadas = E["banco"].filter(function (p) { return !vistas.has(normalizar(p["Pregunta"])); });
    // Si faltan faciles, el bloque de memoria se completa con preguntas nuevas (no valoradas).
    const nuevas = barajar(no_presentadas).slice(0, Math.max(0, C.N_MEMORIA_CATEGORIA - faciles.length)).map(
        function (p) { return {"pregunta": p, "conocimiento": null, "mem_categoria": "nueva"}; });
    const datos = {"fase": "resumen_clasificacion", "sel_estado": E["estado_clasificacion"],
                 "sel_n_valoradas": E["valoraciones"].length, "sel_n_banco": E["banco"].length,
                 "sel_cuotas": a_json(C.CUOTAS), "sel_seleccionadas": a_json(E["conteos"]),
                 "sel_n_no_presentadas": no_presentadas.length,
                 "sel_n_relleno_trivia": n_relleno_trivia,
                 "mem_n_faciles": faciles.length, "mem_n_nuevas_relleno": nuevas.length,
                 "sel_orden_banco": a_json(E["orden_banco"].map(function (p) { return p["sel_uid"]; }))};
    let mensaje;
    if (seleccion.length !== C.N_BLOQUES * C.PREGUNTAS_POR_BLOQUE
            || faciles.length + nuevas.length < C.N_MEMORIA_CATEGORIA) {
        E["continuar"] = false;
        datos["sel_memoria_faciles_estado"] = "insuficientes";
        mensaje = ("No hay suficientes preguntas en el banco.\n\n" +
                   "Contacta con el equipo investigador.");
    } else {
        E["faciles_memoria"] = barajar(faciles).concat(nuevas);
        E["bloques"] = asignar_bloques(seleccion);
        datos["sel_memoria_faciles_estado"] = (nuevas.length === 0) ? "listas" : "con_relleno";
        datos["sel_uids_seleccionadas"] = a_json(seleccion.map(function (x) { return x["pregunta"]["sel_uid"]; }));
        datos["sel_uids_relleno_trivia"] = a_json(seleccion.filter(function (x) { return x["relleno"] === 1; }).map(function (x) { return x["pregunta"]["sel_uid"]; }));
        datos["mem_uids_faciles"] = a_json(faciles.map(function (x) { return x["pregunta"]["sel_uid"]; }));
        datos["mem_uids_nuevas"] = a_json(nuevas.map(function (x) { return x["pregunta"]["sel_uid"]; }));
        datos["plan_bloques"] = a_json(E["bloques"].map(function (bl) { return bl.map(function (e) { return e["sel_uid"]; }); }));
        mensaje = ("Primera parte terminada.\n\nA continuación comenzará el juego de preguntas.");
    }
    return [datos, mensaje];
}

// ---------------- Trivia ----------------
function iniciar_practica() {
    E["fase"] = "practica"; E["bloque"] = 0; E["monedas"] = 0;
    E["ayudas_totales"] = C.AYUDAS_PRACTICA; E["ayudas_restantes"] = C.AYUDAS_PRACTICA;
}
function iniciar_fase_principal() { E["fase"] = "principal"; E["monedas"] = 0; E["memory_bank"] = []; }
function iniciar_bloque(numero) {
    E["fase"] = "principal"; E["bloque"] = numero;
    E["ayudas_totales"] = C.AYUDAS_POR_BLOQUE; E["ayudas_restantes"] = C.AYUDAS_POR_BLOQUE;
    E["monedas_inicio_bloque"] = E["monedas"];
}
function cerrar_bloque() {
    const neto = E["monedas"] - E["monedas_inicio_bloque"];
    let penalizacion = 0;
    if (E["ayudas_restantes"] > 0) { penalizacion = Math.max(0, neto) / 2.0; }
    E["monedas"] = E["monedas"] - penalizacion;
    return {"fase": "resumen_bloque", "bloque": E["bloque"],
            "ayudas_sin_usar": E["ayudas_restantes"],
            "monedas_bloque_antes_penalizacion": neto,
            "penalizacion_ayudas": penalizacion, "monedas_total": E["monedas"]};
}

function cargar_ensayo(indice) {
    const fase = E["fase"];
    let ensayo, total, cp, co;
    if (fase === "practica") { ensayo = E["practica"][indice]; total = C.N_PRACTICA; }
    else if (fase === "principal") { ensayo = E["bloques"][E["bloque"] - 1][indice]; total = C.PREGUNTAS_POR_BLOQUE; }
    else { ensayo = E["memoria"][indice]; total = E["memoria"].length; }
    const n = indice + 1;
    E["ensayo"] = ensayo; E["n_ensayo"] = n; E["total_fase"] = total;
    E["inicios"] = {"pregunta": null, "opciones": null, "gpt": null};
    if (fase === "practica") {
        cp = "Práctica " + n + "/" + total + " - ChatGPT " + E["ayudas_restantes"];
        co = "Práctica " + n + "/" + total;
    } else if (fase === "principal") {
        cp = ("B" + E["bloque"] + "/" + C.N_BLOQUES + " - Pregunta " + n + "/" + total + " - ChatGPT " + E["ayudas_restantes"]);
        co = "B" + E["bloque"] + "  " + n + "/" + total;
    } else {
        cp = "Memoria " + n + "/" + total; co = cp;
    }
    return {"pregunta_txt": ensayo["Pregunta"],
            "opcion_a": "1) " + ensayo["A"], "opcion_b": "2) " + ensayo["B"],
            "opcion_c": "3) " + ensayo["C"], "opcion_d": "4) " + ensayo["D"],
            "tecla_correcta": String(ensayo["Key"]), "gpt_ruta": ensayo["GPT"],
            "texto_solucion": "La respuesta correcta es:\n" + ensayo["Correct"],
            "texto_contador_pregunta": cp, "texto_contador_opciones": co};
}

function preparar_opciones() {
    const restantes = E["total_fase"] - E["n_ensayo"] + 1;
    const ayudas = E["ayudas_restantes"];
    let cuota = 0;
    if (E["fase"] === "principal" && ayudas > 0 && ayudas >= restantes) { cuota = 1; }
    let eleccion = 0;
    if (ayudas > 0 && cuota === 0) { eleccion = 1; }
    E["t"] = {"gpt_usado": false, "rt_chatgpt": null, "espacios": [],
              "ayudas_al_inicio": ayudas, "preguntas_restantes_al_inicio": restantes,
              "cuota_condiciona_consulta": cuota, "eleccion": eleccion,
              "feedback_msg": "", "feedback_color": "black"};
    return cuota;
}
function texto_ayudas() { return "ChatGPT: " + E["ayudas_restantes"] + "/" + E["ayudas_totales"]; }

function procesar_consulta(rt) {
    const t = E["t"];
    const sin_comodines = E["ayudas_restantes"] <= 0;
    let estado;
    if (t["gpt_usado"]) { estado = "ayuda_ya_visible"; }
    else if (sin_comodines) { estado = "sin_comodines"; }
    else {
        estado = "consulta_aceptada";
        t["gpt_usado"] = true; t["rt_chatgpt"] = rt;
        E["ayudas_restantes"] = E["ayudas_restantes"] - 1;
    }
    t["espacios"].push({"rt": rt, "estado": estado, "sin_comodines": sin_comodines ? 1 : 0});
    return estado === "consulta_aceptada";
}

function evaluar(respuesta, correcta) {
    if (respuesta === null) { return [0, C.MONEDAS_ERROR, "omision"]; }
    if (String(respuesta) === String(correcta)) { return [1, C.MONEDAS_ACIERTO, "acierto"]; }
    return [0, C.MONEDAS_ERROR, "error"];
}

function cerrar_ensayo_trivia(teclas, tiempos) {
    const e = E["ensayo"]; const t = E["t"];
    const respuesta = primera_tecla(teclas);
    let rt = null;
    if (respuesta !== null) { rt = primer_rt(tiempos); }
    const ev = evaluar(respuesta, e["Key"]);
    const acierto = ev[0], cambio = ev[1], resultado = ev[2];
    E["monedas"] = E["monedas"] + cambio;
    t["feedback_msg"] = MENSAJES_RESULTADO[resultado];
    t["feedback_color"] = (acierto === 1) ? "green" : "red";
    const consulta = t["gpt_usado"] ? 1 : 0;
    const cuota = t["cuota_condiciona_consulta"];
    const espacios = t["espacios"];
    let n_sin = 0;
    for (const x of espacios) { n_sin += x["sin_comodines"]; }
    const datos = {"fase": E["fase"], "numero_bloque": E["bloque"], "pregunta_en_bloque": E["n_ensayo"],
                 "question_ID": e["ID"], "question": e["Pregunta"], "Correct_answer": e["Correct"],
                 "A": e["A"], "B": e["B"], "C": e["C"], "D": e["D"], "Key": e["Key"],
                 "key_correcta": String(e["Key"]), "gpt_imagen": e["GPT"],
                 "respuesta_final": respuesta, "acierto": acierto, "resultado": resultado,
                 "cambio_monedas": cambio, "monedas": E["monedas"],
                 "uso_chatgpt": consulta, "gpt_usado_en_este_trial": consulta,
                 "usos_chatgpt_restantes": E["ayudas_restantes"],
                 "rt_chatgpt": t["rt_chatgpt"], "rt_respuesta": rt,
                 "question_onset": E["inicios"]["pregunta"], "answers_onset": E["inicios"]["opciones"],
                 "gpt_onset": E["inicios"]["gpt"],
                 "ayudas_al_inicio": t["ayudas_al_inicio"],
                 "preguntas_restantes_al_inicio": t["preguntas_restantes_al_inicio"],
                 "cuota_condiciona_consulta": cuota, "aviso_cuota_rojo": cuota,
                 "eleccion_entre_consultar_y_responder": t["eleccion"],
                 "consulta_condicionada_cuota": (consulta === 1 && cuota === 1) ? 1 : 0,
                 "consulta_elegida": (consulta === 1 && cuota === 0) ? 1 : 0,
                 "espacio_pulsado": espacios.length > 0 ? 1 : 0,
                 "espacio_n_pulsaciones": espacios.length,
                 "espacio_rt_primera": espacios.length > 0 ? espacios[0]["rt"] : null,
                 "espacio_eventos": a_json(espacios), "espacio_n_sin_comodines": n_sin};
    if (E["fase"] === "principal") {
        datos["sel_uid"] = e["sel_uid"];
        datos["conocimiento_clasificacion"] = e["sel_conocimiento"];
        datos["categoria_conocimiento"] = e["sel_categoria"];
        datos["sel_escala"] = C.ESCALA;
        datos["orden_bloque"] = e["orden_bloque"];
        datos["sel_relleno"] = e["sel_relleno"];
        E["memory_bank"].push({"sel_uid": e["sel_uid"], "ID": e["ID"], "Pregunta": e["Pregunta"],
                               "Correct": e["Correct"], "A": e["A"], "B": e["B"], "C": e["C"],
                               "D": e["D"], "Key": e["Key"], "Block": e["Block"],
                               "used_ai": consulta, "response": respuesta, "correct": acierto,
                               "sel_conocimiento": e["sel_conocimiento"],
                               "consulta_condicionada_cuota": datos["consulta_condicionada_cuota"],
                               "ultima_exposicion_fin": null});
    }
    return datos;
}

// ---------------- Tarea de puntos ----------------
function preparar_puntos(indice) {
    const fila = E["puntos"][indice];
    const azul_original_izq = parseFloat(String(fila["blueSide"]).split(",")[0]) < 0;
    const correcto_original = entero(fila["correctLeft"]);
    const azul_izq = Math.random() < 0.5;
    const correcto = (azul_izq === azul_original_izq) ? correcto_original : 1 - correcto_original;
    const imagenes = [];
    for (const col of C.COLUMNAS_PUNTOS) { imagenes.push("IMAGES/" + String(fila[col]).trim()); }
    E["p"] = {"n": indice + 1, "correcto_original": correcto_original, "correcto_izq": correcto,
              "azul_izq": azul_izq ? 1 : 0, "imagenes": imagenes,
              "feedback_pic": "IMAGES/feedbackOmission.png"};
    return {"imagenes": imagenes, "azul_izq": azul_izq};
}

function cerrar_puntos(nombres, tiempos) {
    const p = E["p"];
    let respuesta_izq = null, rt = null, clics_fuera = 0;
    if (nombres !== undefined && nombres !== null) {
        for (let i = 0; i < nombres.length; i++) {
            if (nombres[i] === null || nombres[i] === undefined) { clics_fuera += 1; }
            else if (respuesta_izq === null) {
                respuesta_izq = (String(nombres[i]) === "circulo_izq") ? 1 : 0;
                if (tiempos && i < tiempos.length) { rt = parseFloat(tiempos[i]); }
            }
        }
    }
    let color = null, resultado;
    if (respuesta_izq === null) {
        resultado = "omision"; p["feedback_pic"] = "IMAGES/feedbackOmission.png";
    } else {
        color = (respuesta_izq === p["azul_izq"]) ? "azul" : "rojo";
        if (respuesta_izq === p["correcto_izq"]) { resultado = "acierto"; p["feedback_pic"] = "IMAGES/feedbackCorrect.png"; }
        else { resultado = "error"; p["feedback_pic"] = "IMAGES/feedbackIncorrect.png"; }
    }
    return {"fase": "distractora", "puntos_ensayo": p["n"],
            "correctLeft_original": p["correcto_original"], "correctLeft_mostrado": p["correcto_izq"],
            "azul_izquierda": p["azul_izq"], "responseLeft": respuesta_izq,
            "puntos_color_elegido": color, "puntos_rt": rt, "puntos_resultado": resultado,
            "puntos_clics_fuera": clics_fuera,
            "puntos_acierto": resultado === "acierto" ? 1 : 0,
            "puntos_imagenes": a_json(p["imagenes"]),
            "puntos_fijacion_s": C.PUNTOS_FIJACION, "puntos_nube_s": C.PUNTOS_NUBE,
            "puntos_max_respuesta_s": C.PUNTOS_MAX_RESPUESTA};
}

// ---------------- Memoria ----------------
function preparar_memoria() {
    const con = E["memory_bank"].filter(function (r) { return r["used_ai"] === 1; });
    const sin = E["memory_bank"].filter(function (r) { return r["used_ai"] === 0; });
    const datos = {"fase": "preparacion_memoria", "mem_n_con_GPT_disponibles": con.length,
                 "mem_n_sin_GPT_disponibles": sin.length};
    E["monedas_trivia_final"] = E["monedas"];
    E["monedas_memoria"] = 0;
    E["memoria_resultados"] = {"acierto": 0, "error": 0, "omision": 0};
    const N = C.N_MEMORIA_CATEGORIA;
    if (con.length < N || sin.length < N || E["faciles_memoria"].length < N) {
        E["continuar"] = false; datos["mem_preparada"] = 0; return datos;
    }
    let elegidas = [];
    const grupos = [[con, "con_GPT"], [sin, "sin_GPT"]];
    for (const g of grupos) {
        for (const r of barajar(g[0]).slice(0, N)) {
            elegidas.push({"ID": r["ID"], "Pregunta": r["Pregunta"], "Correct": r["Correct"],
                           "A": r["A"], "B": r["B"], "C": r["C"], "D": r["D"], "Key": r["Key"],
                           "GPT": "", "mem_categoria": g[1], "mem_uid": r["sel_uid"],
                           "mem_bloque_origen": r["Block"], "mem_respuesta_previa": r["response"],
                           "mem_acierto_previo": r["correct"],
                           "mem_conocimiento_inicial": r["sel_conocimiento"],
                           "mem_consulta_cuota": r["consulta_condicionada_cuota"],
                           "ultima_exposicion_fin": r["ultima_exposicion_fin"]});
        }
    }
    for (const v of E["faciles_memoria"].slice(0, N)) {
        const q = v["pregunta"];
        elegidas.push({"ID": q["ID"], "Pregunta": q["Pregunta"], "Correct": q["Correct"],
                       "A": q["A"], "B": q["B"], "C": q["C"], "D": q["D"], "Key": q["Key"],
                       "GPT": "", "mem_categoria": v["mem_categoria"], "mem_uid": q["sel_uid"],
                       "mem_bloque_origen": null, "mem_respuesta_previa": null,
                       "mem_acierto_previo": null, "mem_conocimiento_inicial": v["conocimiento"],
                       "mem_consulta_cuota": null, "ultima_exposicion_fin": null});
    }
    elegidas = barajar(elegidas);
    let ultima = null;
    for (let i = 0; i < elegidas.length; i++) {
        elegidas[i]["mem_orden"] = i + 1;
        if (elegidas[i]["mem_categoria"] === "con_GPT" || elegidas[i]["mem_categoria"] === "sin_GPT") {
            const fin = elegidas[i]["ultima_exposicion_fin"];
            if (fin === null) { throw new Error("Falta el tiempo de exposición de una pregunta repetida."); }
            if (ultima === null || fin > ultima) { ultima = fin; }
        }
    }
    E["memoria"] = elegidas;
    E["memoria_hay_nuevas"] = elegidas.some(function (x) { return x["mem_categoria"] === "nueva"; });
    E["memoria_no_antes_de"] = ultima + C.MIN_INTERVALO_MEMORIA;
    E["fase"] = "memoria";
    datos["mem_preparada"] = 1;
    datos["mem_plan"] = a_json(elegidas.map(function (x) { return [x["mem_orden"], x["mem_uid"], x["mem_categoria"]]; }));
    datos["mem_inicio_no_antes_de"] = E["memoria_no_antes_de"];
    return datos;
}

function cerrar_memoria(teclas, tiempos) {
    const e = E["ensayo"];
    const respuesta = primera_tecla(teclas);
    let rt = null;
    if (respuesta !== null) { rt = primer_rt(tiempos); }
    const ev = evaluar(respuesta, e["Key"]);
    E["monedas_memoria"] = E["monedas_memoria"] + ev[1];
    E["monedas"] = E["monedas"] + ev[1];
    E["memoria_resultados"][ev[2]] = E["memoria_resultados"][ev[2]] + 1;
    let intervalo = null;
    if (e["ultima_exposicion_fin"] !== null && E["inicios"]["pregunta"] !== null) {
        intervalo = E["inicios"]["pregunta"] - e["ultima_exposicion_fin"];
    }
    let cumplido = null;
    if (intervalo !== null) { cumplido = (intervalo >= C.MIN_INTERVALO_MEMORIA) ? 1 : 0; }
    return {"fase": "memoria", "mem_orden": e["mem_orden"], "mem_categoria": e["mem_categoria"],
            "mem_uid": e["mem_uid"], "question_ID": e["ID"], "question": e["Pregunta"],
            "Correct_answer": e["Correct"], "A": e["A"], "B": e["B"], "C": e["C"], "D": e["D"],
            "Key": e["Key"], "mem_bloque_origen": e["mem_bloque_origen"],
            "mem_respuesta_previa": e["mem_respuesta_previa"],
            "mem_acierto_previo": e["mem_acierto_previo"],
            "mem_conocimiento_inicial": e["mem_conocimiento_inicial"],
            "mem_consulta_cuota": e["mem_consulta_cuota"],
            "mem_respuesta": respuesta, "mem_acierto": ev[0], "mem_resultado": ev[2], "mem_rt": rt,
            "mem_pregunta_onset": E["inicios"]["pregunta"],
            "mem_opciones_onset": E["inicios"]["opciones"], "mem_sin_ayuda": 1,
            "mem_ultima_exposicion_fin": e["ultima_exposicion_fin"],
            "mem_intervalo_desde_exposicion": intervalo,
            "mem_intervalo_minimo_configurado": C.MIN_INTERVALO_MEMORIA,
            "mem_intervalo_cumplido": cumplido, "mem_cambio_monedas": ev[1],
            "mem_monedas_acumuladas": E["monedas_memoria"], "monedas": E["monedas"]};
}

function cerrar_experimento() {
    const r = E["memoria_resultados"];
    return {"fase": "fin_experimento", "monedas_trivia_final": E["monedas_trivia_final"],
            "monedas_memoria_final": E["monedas_memoria"], "monedas_total_final": E["monedas"],
            "mem_n_acierto": r["acierto"], "mem_n_error": r["error"], "mem_n_omision": r["omision"],
            "competicion_completada": 1};
}

window.Logica = {
    CFG, E, MENSAJES_RESULTADO,
    setReloj: function (f) { reloj = f; },
    barajar, formato_numero, formato_mmss, registrar_inicio, registrar_fin_exposicion,
    iniciar_estado, valorar, cerrar_clasificacion,
    iniciar_practica, iniciar_fase_principal, iniciar_bloque, cerrar_bloque,
    cargar_ensayo, preparar_opciones, texto_ayudas, procesar_consulta, cerrar_ensayo_trivia,
    preparar_puntos, cerrar_puntos, preparar_memoria, cerrar_memoria, cerrar_experimento,
};
})();
