"""
Regenera materiales/materiales.js a partir de:
  - materiales/banco_preguntas.xlsx, practica.xlsx, distractor.xlsx  (los mismos de PsychoPy)
  - materiales/respuestas_chatgpt.csv  (texto que se muestra al consultar ChatGPT, por imagen)

Úsalo si cambias preguntas o corriges alguna respuesta de ChatGPT:
    python herramientas/generar_materiales.py
(ejecútalo desde la carpeta trivia_movil; requiere pandas y openpyxl)

Formato del texto de ChatGPT: **negrita**, *cursiva*, salto de línea = \\n
y [[Pensó durante un segundo]] al principio para la línea gris de «pensamiento».
"""
import json
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
MAT = BASE / "materiales"


def filas(xlsx):
    df = pd.read_excel(MAT / xlsx)
    out = []
    for r in df.to_dict("records"):
        o = {}
        for k, v in r.items():
            if isinstance(v, float) and v != v:
                v = None
            elif isinstance(v, float) and v.is_integer():
                v = int(v)
            o[k] = v
        out.append(o)
    return out


def main():
    banco, practica, distractor = filas("banco_preguntas.xlsx"), filas("practica.xlsx"), filas("distractor.xlsx")
    gpt = pd.read_csv(MAT / "respuestas_chatgpt.csv", encoding="utf-8-sig", dtype=str).fillna("")
    textos = {r.GPT_Image.strip(): r.texto_mostrado.replace("\\n", "\n") for r in gpt.itertuples()}
    faltan = sorted({str(f["GPT_Image"]).strip() for f in banco + practica} - set(textos))
    if faltan:
        print("AVISO: no hay texto de ChatGPT para:", ", ".join(faltan))
    js = "// Generado por herramientas/generar_materiales.py - no editar a mano.\n"
    for nombre, valor in (("BANCO", banco), ("PRACTICA", practica), ("DISTRACTOR", distractor), ("GPT_TEXTO", textos)):
        js += f"window.{nombre} = {json.dumps(valor, ensure_ascii=False, indent=0)};\n"
    (MAT / "materiales.js").write_text(js, encoding="utf-8")
    print(f"materiales.js actualizado: {len(banco)} preguntas, {len(practica)} de práctica, "
          f"{len(distractor)} ensayos de puntos, {len(textos)} respuestas de ChatGPT.")


if __name__ == "__main__":
    main()
