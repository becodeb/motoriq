"""Imágenes placeholder SVG para los vehículos del seed.

Siluetas estilizadas por tipo de carrocería sobre fondo oscuro con acento del
color del vehículo. Se sirven desde /uploads como cualquier foto real; al
cargar fotos reales desde la ficha del vehículo, estas quedan como secundarias.
"""

COLOR_HEX = {
    "blanco": "#e2e8f0",
    "negro": "#475569",
    "gris": "#94a3b8",
    "plata": "#cbd5e1",
    "rojo": "#ef4444",
    "azul": "#3b82f6",
    "verde": "#22c55e",
    "bordo": "#9f1239",
    "beige": "#d6c7a1",
    "naranja": "#f97316",
}

_SEDAN_BODY = (
    "M40 150 Q44 118 84 108 L148 96 Q188 52 268 48 L344 50 Q408 56 442 98 L496 108 "
    "Q534 116 538 146 L538 168 Q538 182 522 182 L488 182 A40 40 0 0 0 408 182 L188 182 "
    "A40 40 0 0 0 108 182 L56 182 Q40 182 40 166 Z"
)
_SEDAN_GLASS = "M162 98 Q196 62 266 58 L336 60 Q392 66 420 98 L300 102 Z"

_SUV_BODY = (
    "M38 152 Q40 112 78 104 L128 96 Q150 40 240 36 L400 38 Q470 42 488 92 L510 100 "
    "Q540 108 542 144 L542 168 Q542 182 526 182 L492 182 A40 40 0 0 0 412 182 L186 182 "
    "A40 40 0 0 0 106 182 L54 182 Q38 182 38 168 Z"
)
_SUV_GLASS = "M148 96 Q168 50 242 46 L392 48 Q448 52 468 92 L310 98 Z"

_PICKUP_BODY = (
    "M38 152 Q40 116 76 108 L120 100 Q142 46 226 42 L306 44 Q352 48 368 96 L380 100 "
    "L380 88 Q380 78 392 78 L528 78 Q542 78 542 92 L542 166 Q542 182 526 182 L494 182 "
    "A40 40 0 0 0 414 182 L186 182 A40 40 0 0 0 106 182 L54 182 Q38 182 38 168 Z"
)
_PICKUP_GLASS = "M140 100 Q160 54 228 50 L296 52 Q336 56 350 96 L240 100 Z"

_BODIES = {
    "sedan": (_SEDAN_BODY, _SEDAN_GLASS),
    "hatchback": (_SEDAN_BODY, _SEDAN_GLASS),
    "coupe": (_SEDAN_BODY, _SEDAN_GLASS),
    "suv": (_SUV_BODY, _SUV_GLASS),
    "furgon": (_SUV_BODY, _SUV_GLASS),
    "pickup": (_PICKUP_BODY, _PICKUP_GLASS),
    "otro": (_SEDAN_BODY, _SEDAN_GLASS),
}


def vehicle_svg(brand: str, model: str, year: int, color_name: str | None, body_type: str) -> str:
    accent = COLOR_HEX.get((color_name or "").lower(), "#64748b")
    body_path, glass_path = _BODIES.get(body_type, _BODIES["sedan"])
    brand_upper = brand.upper()
    model_text = model if len(model) <= 18 else model[:17] + "…"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" role="img" aria-label="{brand} {model}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#1a2536"/>
    </linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{accent}"/>
      <stop offset="1" stop-color="{accent}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/>
  <circle cx="480" cy="110" r="230" fill="{accent}" opacity="0.08"/>
  <circle cx="130" cy="330" r="160" fill="{accent}" opacity="0.05"/>
  <g transform="translate(32,84)">
    <ellipse cx="290" cy="196" rx="268" ry="16" fill="#000" opacity="0.35"/>
    <path d="{body_path}" fill="url(#paint)"/>
    <path d="{glass_path}" fill="#0f172a" opacity="0.85"/>
    <circle cx="148" cy="182" r="34" fill="#0b1220"/>
    <circle cx="148" cy="182" r="33" fill="none" stroke="#1e293b" stroke-width="3"/>
    <circle cx="148" cy="182" r="14" fill="#334155"/>
    <circle cx="448" cy="182" r="34" fill="#0b1220"/>
    <circle cx="448" cy="182" r="33" fill="none" stroke="#1e293b" stroke-width="3"/>
    <circle cx="448" cy="182" r="14" fill="#334155"/>
    <rect x="40" y="150" width="498" height="4" fill="#fff" opacity="0.06" rx="2"/>
  </g>
  <text x="36" y="330" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="4">{brand_upper}</text>
  <text x="36" y="362" fill="#f1f5f9" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">{model_text}</text>
  <rect x="546" y="334" width="62" height="30" rx="15" fill="#ffffff" opacity="0.08"/>
  <text x="577" y="354" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" text-anchor="middle">{year}</text>
</svg>"""
