"""Seed demo de POPS (§58): una agencia viva desde el primer login.

Ejecutar:  python -m app.seed

Los motores reales (scoring, matching, insights, salud) corren sobre los datos
sembrados — los números que ves en la UI salen del mismo código de producción.
RNG determinístico: random.Random(42). Fechas relativas a la ejecución.
"""

import random
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.constants import DEFAULT_PIPELINE_STAGES
from app.core.security import hash_password
from app.core.utils import utcnow
from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.models import (
    Appointment,
    Automation,
    Conversation,
    Customer,
    CustomerNote,
    FinancingScenario,
    Followup,
    LeadScoreHistory,
    Message,
    Opportunity,
    OpportunityStageHistory,
    Organization,
    PipelineStage,
    Quote,
    Segment,
    Tag,
    Task,
    TradeIn,
    User,
    Vehicle,
    VehicleImage,
    VehicleStatusHistory,
)
from app.seed_assets import vehicle_svg
from app.services import audit, insights, matching, scoring
from app.services.opportunities import refresh_health

rng = random.Random(42)
NOW = utcnow()
PASSWORD = "demo1234"


def h(hours: float):
    return NOW - timedelta(hours=hours)


def d(days: float):
    return NOW - timedelta(days=days)


# ---------------------------------------------------------------- vehículos

VEHICLES = [
    # (marca, modelo, versión, año, km, precio, carrocería, caja, combustible, color, días_en_stock, estado)
    ("Toyota", "Corolla", "XEI 2.0 CVT", 2022, 34500, 23500, "sedan", "automatica", "nafta", "Blanco", 18, "disponible"),
    ("Toyota", "Corolla", "SEG 2.0 CVT", 2021, 51000, 21900, "sedan", "automatica", "nafta", "Gris", 34, "disponible"),
    ("Toyota", "Hilux", "SRX 4x4 AT", 2021, 68000, 33900, "pickup", "automatica", "diesel", "Negro", 27, "disponible"),
    ("Toyota", "Yaris", "XLS CVT", 2023, 18000, 17500, "hatchback", "automatica", "nafta", "Rojo", 12, "disponible"),
    ("Volkswagen", "Taos", "Highline 250 TSI", 2023, 22000, 28900, "suv", "automatica", "nafta", "Azul", 3, "disponible"),
    ("Volkswagen", "Amarok", "V6 Extreme", 2020, 98000, 31500, "pickup", "automatica", "diesel", "Gris", 41, "disponible"),
    ("Volkswagen", "Gol Trend", "Trendline", 2019, 87000, 11500, "hatchback", "manual", "nafta", "Blanco", 95, "disponible"),
    ("Peugeot", "208", "Allure 1.6", 2022, 29000, 16800, "hatchback", "manual", "nafta", "Blanco", 22, "disponible"),
    ("Peugeot", "2008", "Feline 1.6", 2021, 44000, 18900, "suv", "automatica", "nafta", "Gris", 48, "disponible"),
    ("Fiat", "Cronos", "Precision 1.8", 2022, 31000, 15200, "sedan", "manual", "nafta", "Plata", 29, "disponible"),
    ("Fiat", "Toro", "Freedom 4x2", 2021, 56000, 24500, "pickup", "automatica", "diesel", "Rojo", 52, "disponible"),
    ("Ford", "Ranger", "Limited 4x4", 2022, 47000, 35800, "pickup", "automatica", "diesel", "Azul", 31, "disponible"),
    ("Ford", "Territory", "SEL 1.5T", 2022, 38000, 26900, "suv", "automatica", "nafta", "Negro", 44, "disponible"),
    ("Chevrolet", "Onix", "Premier 1.0T", 2022, 26000, 16200, "hatchback", "automatica", "nafta", "Blanco", 25, "disponible"),
    ("Chevrolet", "Tracker", "LTZ 1.2T", 2021, 49000, 19800, "suv", "automatica", "nafta", "Gris", 58, "disponible"),
    ("Honda", "HR-V", "EXL CVT", 2020, 61000, 21500, "suv", "automatica", "nafta", "Plata", 63, "disponible"),
    ("Renault", "Duster", "Intens 1.6", 2021, 52000, 17900, "suv", "manual", "nafta", "Naranja", 39, "disponible"),
    ("Renault", "Kangoo", "Stepway 1.6", 2020, 74000, 14500, "furgon", "manual", "nafta", "Blanco", 78, "disponible"),
    ("Citroën", "C4 Cactus", "Feel Pack", 2019, 69000, 13900, "suv", "automatica", "nafta", "Verde", 112, "disponible"),
    ("Nissan", "Frontier", "SE 4x2", 2021, 59000, 29900, "pickup", "manual", "diesel", "Gris", 36, "disponible"),
    ("Jeep", "Renegade", "Sport 1.8", 2021, 43000, 19500, "suv", "automatica", "nafta", "Negro", 47, "reservado"),
    ("Toyota", "Etios", "XLS 1.5", 2018, 92000, 9800, "hatchback", "manual", "nafta", "Plata", 9, "preparacion"),
]

SOLD_VEHICLES = [
    # (marca, modelo, versión, año, km, precio_lista, precio_venta, carrocería, caja, comb., color, vendido_hace_días, días_en_stock)
    ("Toyota", "Corolla", "XLI 1.8", 2020, 58000, 21500, 21000, "sedan", "automatica", "nafta", "Gris", 15, 28),
    ("Volkswagen", "Taos", "Comfortline", 2022, 35000, 27200, 26500, "suv", "automatica", "nafta", "Blanco", 25, 22),
    ("Toyota", "Hilux", "SRV 4x2", 2019, 105000, 29000, 28500, "pickup", "manual", "diesel", "Blanco", 40, 35),
    ("Toyota", "Corolla", "XEI 1.8", 2019, 74000, 19400, 18900, "sedan", "automatica", "nafta", "Negro", 55, 25),
    ("Chevrolet", "Onix", "LTZ 1.2", 2021, 39000, 15300, 14800, "hatchback", "manual", "nafta", "Rojo", 70, 55),
    ("Peugeot", "208", "Active 1.6", 2021, 46000, 15900, 15500, "hatchback", "manual", "nafta", "Gris", 100, 41),
    ("Chevrolet", "Tracker", "Premier", 2020, 66000, 17800, 17200, "suv", "automatica", "nafta", "Azul", 130, 61),
    ("Fiat", "Cronos", "Drive 1.3", 2021, 42000, 14300, 13900, "sedan", "manual", "nafta", "Blanco", 160, 47),
]

LOCATIONS = ("Sucursal Centro", "Sucursal Norte", "Depósito")


def _plate() -> str:
    letters = "".join(rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(2))
    tail = "".join(rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(2))
    return f"A{letters[0]}{rng.randint(100, 999)}{tail}"


def _phone() -> str:
    return f"+54 9 11 {rng.randint(3000, 6999)}-{rng.randint(1000, 9999)}"


# ---------------------------------------------------------------- clientes

NAMES = [
    ("Juan", "Pérez"), ("Martina", "López"), ("Carlos", "Gutiérrez"), ("Lucía", "Fernández"),
    ("Federico", "Álvarez"), ("Valentina", "Romero"), ("Nicolás", "Sosa"), ("Camila", "Torres"),
    ("Matías", "Ramírez"), ("Julieta", "Flores"), ("Santiago", "Benítez"), ("Agustina", "Acosta"),
    ("Tomás", "Medina"), ("Florencia", "Herrera"), ("Bruno", "Aguirre"), ("Rocío", "Giménez"),
    ("Gonzalo", "Molina"), ("Milagros", "Castro"), ("Ramiro", "Ortiz"), ("Antonella", "Silva"),
    ("Ezequiel", "Núñez"), ("Paula", "Rojas"), ("Ignacio", "Vega"), ("Carolina", "Ponce"),
    ("Facundo", "Cabrera"), ("Daniela", "Vargas"), ("Marcos", "Ferreyra"), ("Josefina", "Luna"),
    ("Emiliano", "Ríos"), ("Victoria", "Campos"), ("Sebastián", "Morales"), ("Guadalupe", "Peralta"),
    ("Lautaro", "Ibáñez"), ("Micaela", "Suárez"), ("Alejandro", "Paz"), ("Bianca", "Cardozo"),
    ("Hernán", "Ledesma"), ("Sol", "Villalba"), ("Cristian", "Arias"), ("Melina", "Bustos"),
    ("Pablo", "Escobar"), ("Renata", "Godoy"), ("Damián", "Correa"), ("Ariana", "Maldonado"),
    ("Leandro", "Figueroa"), ("Cecilia", "Navarro"), ("Mauro", "Quiroga"), ("Abril", "Palacios"),
    ("Iván", "Salinas"), ("Constanza", "Miranda"),
]

SOURCES_POOL = (
    ["whatsapp"] * 18 + ["mercadolibre"] * 10 + ["instagram"] * 8 + ["web"] * 6
    + ["facebook"] * 4 + ["presencial"] * 2 + ["recomendacion"] * 2
)


def run() -> None:
    settings = get_settings()
    print("→ Reiniciando base de datos…")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    db = SessionLocal()
    try:
        _seed(db, settings)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # Un tick del scheduler para que las notificaciones de vencidos existan ya.
    from app.core.scheduler import run_tick

    run_tick()

    print("\n✅ Seed completo.")
    print("   Org:    Motor IQ (USD · es-AR · America/Argentina/Buenos_Aires)")
    print("   Login:  admin@motoriq.demo / demo1234   (administrador)")
    print("           gerente@motoriq.demo / demo1234 (gerente)")
    print("           lucas@motoriq.demo · sofia@motoriq.demo · diego@motoriq.demo / demo1234 (vendedores)")


def _seed(db, settings) -> None:
    org = Organization(
        name="Motor IQ",
        currency="USD",
        locale="es-AR",
        timezone="America/Argentina/Buenos_Aires",
        lead_distribution="round_robin",
    )
    db.add(org)
    db.flush()

    stages: dict[str, PipelineStage] = {}
    for position, spec in enumerate(DEFAULT_PIPELINE_STAGES):
        stage = PipelineStage(
            organization_id=org.id,
            key=spec["key"],
            name=spec["name"],
            position=position,
            color=spec["color"],
            probability=spec["probability"],
            is_won=spec.get("is_won", False),
            is_lost=spec.get("is_lost", False),
        )
        db.add(stage)
        stages[spec["key"]] = stage
    db.flush()

    print("→ Usuarios…")
    users = {}
    for email, first, last, role, color, created_days in (
        ("admin@motoriq.demo", "Martín", "Ríos", "admin", "violet", 400),
        ("gerente@motoriq.demo", "Carla", "Méndez", "gerente", "cyan", 380),
        ("lucas@motoriq.demo", "Lucas", "Fernández", "vendedor", "emerald", 350),
        ("sofia@motoriq.demo", "Sofía", "Navarro", "vendedor", "amber", 330),
        ("diego@motoriq.demo", "Diego", "Herrera", "vendedor", "rose", 300),
    ):
        user = User(
            organization_id=org.id,
            email=email,
            password_hash=hash_password(PASSWORD),
            first_name=first,
            last_name=last,
            role=role,
            avatar_color=color,
            phone=_phone(),
            last_login_at=d(rng.randint(0, 2)),
            created_at=d(created_days),
        )
        db.add(user)
        users[email.split("@")[0]] = user
    db.flush()
    sellers = [users["lucas"], users["sofia"], users["diego"]]
    # Tiempos de primera respuesta característicos por vendedor (para analytics §37).
    response_profile = {users["lucas"].id: (120, 600), users["sofia"].id: (600, 1500), users["diego"].id: (1200, 3600)}

    print("→ Tags…")
    tags = {}
    for name, color in (
        ("SUV", "blue"), ("Financiación", "violet"), ("Permuta", "amber"), ("Urgente", "red"),
        ("Cliente anterior", "emerald"), ("Empresa", "zinc"), ("Alta intención", "orange"),
    ):
        tag = Tag(organization_id=org.id, name=name, color=color)
        db.add(tag)
        tags[name] = tag
    db.flush()

    print("→ Vehículos…")
    upload_root = Path(settings.upload_dir)
    vehicles: list[Vehicle] = []
    for brand, model, version, year, km, price, body, trans, fuel, color, days, status in VEHICLES:
        vehicle = Vehicle(
            organization_id=org.id,
            brand=brand, model=model, version=version, year=year, km=km,
            price=price, cost=round(price * rng.uniform(0.85, 0.92), 0),
            plate=_plate(), fuel=fuel, transmission=trans, color=color,
            location=rng.choice(LOCATIONS), body_type=body,
            doors=2 if body == "pickup" and rng.random() < 0.2 else rng.choice((4, 5)),
            status=status,
            description=f"{brand} {model} {version} {year}. Servicios oficiales al día, único dueño. Se entrega con verificación y transferencia incluida.",
            entry_date=d(days), published_at=d(days),
            created_at=d(days),
        )
        db.add(vehicle)
        vehicles.append(vehicle)
    db.flush()

    sold_vehicles: list[Vehicle] = []
    for brand, model, version, year, km, price, sold_price, body, trans, fuel, color, sold_ago, stock_days in SOLD_VEHICLES:
        vehicle = Vehicle(
            organization_id=org.id,
            brand=brand, model=model, version=version, year=year, km=km,
            price=price, cost=round(price * rng.uniform(0.85, 0.92), 0),
            plate=_plate(), fuel=fuel, transmission=trans, color=color,
            location=rng.choice(LOCATIONS), body_type=body, doors=rng.choice((4, 5)),
            status="vendido", sold_at=d(sold_ago), sold_price=sold_price,
            description=f"{brand} {model} {version} {year}.",
            entry_date=d(sold_ago + stock_days), published_at=d(sold_ago + stock_days),
            created_at=d(sold_ago + stock_days),
        )
        db.add(vehicle)
        sold_vehicles.append(vehicle)
    db.flush()

    for vehicle in vehicles + sold_vehicles:
        relative = Path(org.id) / "vehicles" / vehicle.id
        target_dir = upload_root / relative
        target_dir.mkdir(parents=True, exist_ok=True)
        svg = vehicle_svg(vehicle.brand, vehicle.model, vehicle.year, vehicle.color, vehicle.body_type)
        (target_dir / "principal.svg").write_text(svg, encoding="utf-8")
        db.add(
            VehicleImage(
                organization_id=org.id, vehicle_id=vehicle.id,
                url=f"/uploads/{(relative / 'principal.svg').as_posix()}", position=0,
            )
        )
        db.add(
            VehicleStatusHistory(
                organization_id=org.id, vehicle_id=vehicle.id, from_status=None,
                to_status="disponible", created_at=vehicle.entry_date,
            )
        )
        if vehicle.status != "disponible":
            db.add(
                VehicleStatusHistory(
                    organization_id=org.id, vehicle_id=vehicle.id, from_status="disponible",
                    to_status=vehicle.status, user_id=users["gerente"].id,
                    created_at=vehicle.sold_at or d(rng.randint(1, 10)),
                )
            )

    by_key = {f"{v.brand} {v.model} {v.version}": v for v in vehicles}
    corolla_xei = by_key["Toyota Corolla XEI 2.0 CVT"]
    corolla_seg = by_key["Toyota Corolla SEG 2.0 CVT"]
    hilux = by_key["Toyota Hilux SRX 4x4 AT"]
    yaris = by_key["Toyota Yaris XLS CVT"]
    taos = by_key["Volkswagen Taos Highline 250 TSI"]
    amarok = by_key["Volkswagen Amarok V6 Extreme"]
    p208 = by_key["Peugeot 208 Allure 1.6"]
    p2008 = by_key["Peugeot 2008 Feline 1.6"]
    cronos = by_key["Fiat Cronos Precision 1.8"]
    toro = by_key["Fiat Toro Freedom 4x2"]
    ranger = by_key["Ford Ranger Limited 4x4"]
    territory = by_key["Ford Territory SEL 1.5T"]
    onix = by_key["Chevrolet Onix Premier 1.0T"]
    tracker = by_key["Chevrolet Tracker LTZ 1.2T"]
    hrv = by_key["Honda HR-V EXL CVT"]
    duster = by_key["Renault Duster Intens 1.6"]

    print("→ Clientes y conversaciones…")
    name_iter = iter(NAMES)
    sources = SOURCES_POOL[:]
    rng.shuffle(sources)
    source_iter = iter(sources)
    seller_cycle_index = 0

    def next_seller() -> User:
        nonlocal seller_cycle_index
        seller = sellers[seller_cycle_index % 3]
        seller_cycle_index += 1
        return seller

    customers: list[Customer] = []
    conversations: dict[str, Conversation] = {}

    def add_customer(
        archetype: str,
        vehicle: Vehicle | None,
        created_days: float,
        budget_factor: float | None = 1.05,
        **extra,
    ) -> Customer:
        first, last = next(name_iter)
        source = next(source_iter)
        seller = next_seller()
        budget = round(vehicle.price * budget_factor, -2) if vehicle and budget_factor else extra.pop("budget", None)
        customer = Customer(
            organization_id=org.id,
            first_name=first, last_name=last,
            phone=_phone(), whatsapp=None, email=f"{first.lower()}.{last.lower()}@gmail.com".replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("á", "a").replace("ñ", "n"),
            source=source,
            assigned_user_id=seller.id,
            interested_vehicle_id=vehicle.id if vehicle else None,
            budget=budget,
            created_at=d(created_days),
            created_by=users["gerente"].id,
            **extra,
        )
        customer.whatsapp = customer.phone
        db.add(customer)
        customers.append(customer)
        db.flush()
        channel = source if source in ("whatsapp", "instagram", "facebook", "mercadolibre", "web") else "whatsapp"
        conversation = Conversation(
            organization_id=org.id, customer_id=customer.id, channel=channel,
            assigned_user_id=seller.id, created_at=customer.created_at,
        )
        db.add(conversation)
        db.flush()
        conversations[customer.id] = conversation
        customer._archetype = archetype  # atributo transitorio del seed
        return customer

    def script(customer: Customer, messages: list[tuple[str, float, str]]) -> None:
        """messages: (direction, hours_ago, text)."""
        conversation = conversations[customer.id]
        seller = next(s for s in sellers if s.id == customer.assigned_user_id)
        first_inbound_at = None
        first_outbound_at = None
        for direction, hours_ago, text in messages:
            at = h(hours_ago)
            text = text.replace("{veh}", customer.interested_vehicle.title if customer.interested_vehicle else "el vehículo")
            text = text.replace("{nombre}", customer.first_name)
            db.add(
                Message(
                    organization_id=org.id, conversation_id=conversation.id, customer_id=customer.id,
                    direction=direction, channel=conversation.channel, body=text,
                    sent_by_user_id=seller.id if direction == "saliente" else None,
                    created_at=at,
                )
            )
            conversation.last_message_at = at
            customer.last_contact_at = at
            if direction == "entrante":
                customer.last_inbound_at = at
                first_inbound_at = first_inbound_at or at
            else:
                customer.last_outbound_at = at
                first_outbound_at = first_outbound_at or at
        if first_outbound_at:
            low, high = response_profile[customer.assigned_user_id]
            customer.first_response_seconds = rng.randint(low, high)
        if customer.last_outbound_at and customer.status == "lead":
            customer.status = "activo"

    # --- A) Calientes con financiación (3)
    hot_financing = []
    for i, (vehicle, created) in enumerate(((corolla_xei, 6), (tracker, 9), (onix, 5))):
        c = add_customer("hot_financing", vehicle, created, financing_interest=True)
        c.tags = [tags["Financiación"], tags["Alta intención"]]
        lines = [
            ("entrante", 40.0, "¡Hola! Vi el {veh} publicado. ¿Sigue disponible?"),
            ("saliente", 39.4, "¡Hola {nombre}! Sí, está disponible. Está impecable, con service oficial al día. ¿Querés que te pase más info?"),
            ("entrante", 30.0, "¿Qué opciones de financiación tienen? ¿Puedo financiar una parte en cuotas?"),
            ("saliente", 29.0, "Trabajamos con financiación bancaria y propia. Con un anticipo del 40% te quedan cuotas muy razonables. Si querés te armo una simulación."),
        ]
        if i == 0:
            lines += [
                ("entrante", 20.0, "Dale, me interesa. ¿Cuándo puedo pasar a verlo?"),
                ("saliente", 6.0, "De lunes a sábado de 9 a 18 estamos en la sucursal. ¿Te queda bien mañana?"),
                ("entrante", 2.0, "Mañana a la tarde puede ser. ¿Me confirmás la dirección?"),
            ]
        elif i == 1:
            lines += [
                ("saliente", 26.0, "Te dejo también el video que le hicimos, está muy cuidado."),
                ("entrante", 4.0, "Buenísimo. Armame la simulación con 40% de anticipo así lo vemos."),
            ]
        else:
            lines += [
                ("entrante", 3.0, "¿Y en cuántas cuotas se puede? Me sirve algo de 24 a 36."),
            ]
        script(c, lines)
        hot_financing.append(c)

    # --- B) Calientes por reservar (2)
    hot_reserva = []
    for vehicle, created in ((hilux, 12), (taos, 4)):
        c = add_customer("hot_reserva", vehicle, created)
        c.tags = [tags["Alta intención"], tags["Urgente"]]
        script(c, [
            ("entrante", 70, "Hola, consulto por la {veh}. ¿Cuál es el precio final de contado?"),
            ("saliente", 69, "¡Hola {nombre}! De contado tiene un precio especial, y también tomamos tu usado. ¿La querés venir a ver?"),
            ("entrante", 45, "La vi el sábado y me encantó. Quiero reservarla, ¿puedo dejar una seña esta semana?"),
            ("saliente", 44, "¡Excelente decisión! Con una seña del 10% te la reservamos. Cuando quieras coordinamos."),
            ("entrante", 3, "Perfecto. ¿Qué documentos necesito para la transferencia?"),
        ])
        hot_reserva.append(c)

    # --- C) Calientes con permuta (3)
    hot_tradein = []
    for vehicle, created, trade in (
        (ranger, 15, ("Volkswagen", "Amarok", "Trendline", 2016, 145000)),
        (territory, 8, ("Peugeot", "308", "Allure", 2017, 98000)),
        (taos, 2, ("Chevrolet", "Cruze", "LT", 2018, 87000)),
    ):
        c = add_customer("hot_tradein", vehicle, created, has_trade_in=True)
        c.tags = [tags["Permuta"]]
        c._trade = trade
        trade_text = f"Dale, te paso: es un {trade[0]} {trade[1]} {trade[2]} {trade[3]} con {trade[4]:,} km. ¿Cuándo lo pueden tasar?".replace(",", ".")
        script(c, [
            ("entrante", 52, "Buenas, ¿sigue en venta el {veh}?"),
            ("saliente", 51, "¡Hola {nombre}! Sí, disponible. ¿Lo conocés o querés que te mande fotos y ficha completa?"),
            ("entrante", 28, "¿Toman mi auto en parte de pago? Tengo un usado para entregar."),
            ("saliente", 27, "Sí, tomamos permutas. Pasame marca, modelo, año y kilómetros y te digo cuánto podemos ofrecerte."),
            ("entrante", 5, trade_text),
        ])
        hot_tradein.append(c)

    # --- D) Tibios (12)
    warm = []
    warm_specs = [
        (corolla_seg, 20, ["disponibilidad", "ubicacion"]),
        (p208, 14, ["disponibilidad", "cotizacion"]),
        (cronos, 25, ["disponibilidad"]),
        (duster, 11, ["ubicacion", "semana"]),
        (hrv, 30, ["cotizacion"]),
        (yaris, 7, ["disponibilidad", "cotizacion"]),
        (p2008, 18, ["disponibilidad"]),
        (amarok, 22, ["cotizacion", "semana"]),
        (toro, 16, ["disponibilidad"]),
        (onix, 28, ["ubicacion"]),
        (tracker, 13, ["disponibilidad", "cotizacion"]),
        (corolla_xei, 10, ["disponibilidad"]),
    ]
    for vehicle, created, signals in warm_specs:
        c = add_customer("warm", vehicle, created, budget_factor=rng.choice((0.95, 1.0, 1.1)))
        lines: list[tuple[str, float, str]] = [
            ("entrante", rng.uniform(90, 130), "Hola, ¿está disponible el {veh}?"),
            ("saliente", rng.uniform(80, 89), "¡Hola {nombre}! Sí, disponible. Cualquier consulta estoy a disposición."),
        ]
        base = rng.uniform(30, 75)
        if "cotizacion" in signals:
            lines.append(("entrante", base, "¿Me pasás el mejor precio de contado? Estoy comparando un par de opciones."))
            lines.append(("saliente", base - 1, "Te preparo una cotización completa con todos los gastos incluidos y te la mando."))
        if "ubicacion" in signals:
            lines.append(("entrante", base - 3, "¿Dónde están ubicados? ¿Se puede ver un sábado?"))
            lines.append(("saliente", base - 4, "Estamos en Av. del Libertador 4500. Sábados de 9 a 13."))
        if "semana" in signals:
            lines.append(("entrante", rng.uniform(10, 26), "Buenísimo, gracias. Escribime la semana que viene y lo coordinamos."))
        db.flush()
        script(c, lines)
        warm.append(c)

    # --- E) Fantasmas (6): mostraron interés y dejaron de responder.
    # Los dos últimos además quedaron sin re-contacto hace >5 días → insight "recuperar".
    ghosted = []
    ghost_specs = [
        (corolla_xei, 24, 5.5, True), (hilux, 30, 6.5, True), (territory, 26, 5.0, True),
        (p2008, 35, 6.0, True), (ranger, 21, 7.0, False), (hrv, 40, 8.0, False),
    ]
    for vehicle, created, inbound_days, recontacted in ghost_specs:
        c = add_customer("ghosted", vehicle, created)
        inbound_ago = inbound_days * 24
        lines = [
            ("entrante", inbound_ago + 50, "Hola, quería consultar por el {veh}."),
            ("saliente", inbound_ago + 48, "¡Hola {nombre}! Sí, disponible. ¿Querés que coordinemos para que lo veas?"),
            ("entrante", inbound_ago + 20, "Me interesa mucho, ¿cuándo puedo pasar a verlo? Además estoy viendo el tema financiación con el banco."),
            ("saliente", inbound_ago + 18, "Genial. Venite cuando quieras de 9 a 18. Y si querés te armo una simulación con nuestra financiación así comparás."),
            ("entrante", inbound_ago, "Dale, en estos días te confirmo."),
        ]
        if recontacted:
            lines += [
                ("saliente", inbound_ago - 30, "¡Hola {nombre}! ¿Cómo venís con lo del banco? Cualquier cosa el {veh} sigue disponible."),
                ("saliente", rng.uniform(60, 90), "¿Pudiste resolverlo? Quedo atento, tengo otra persona interesada y no quiero que te quedes sin él."),
            ]
        else:
            lines += [
                ("saliente", inbound_ago - 20, "¡Hola {nombre}! ¿Pudiste avanzar? Cualquier cosa acá estoy."),
            ]
        script(c, lines)
        ghosted.append(c)

    # --- F) Leads nuevos (8): entraron hoy/ayer, algunos sin responder aún
    new_leads = []
    new_specs = [
        (taos, 0.15, False), (corolla_xei, 0.3, False), (yaris, 0.1, False),
        (hilux, 0.5, True), (p208, 0.9, True), (duster, 1.2, True),
        (cronos, 1.5, True), (territory, 0.7, False),
    ]
    for vehicle, created_days, responded in new_specs:
        c = add_customer("new", vehicle, created_days, budget_factor=None)
        hours_ago = created_days * 24
        lines = [("entrante", hours_ago, "Hola, ¿sigue disponible el {veh}? ¿Me pasás precio?")]
        if responded:
            lines.append(("saliente", hours_ago - rng.uniform(0.2, 1.5), "¡Hola {nombre}! Sí, disponible. Te paso toda la info."))
        script(c, lines)
        new_leads.append(c)

    # --- G) Fríos (7)
    cold = []
    cold_specs = [(p208, 45), (onix, 60), (cronos, 38), (duster, 55), (yaris, 42), (hrv, 66), (tracker, 50)]
    for i, (vehicle, created) in enumerate(cold_specs):
        c = add_customer("cold", vehicle, created, budget_factor=0.65 if i % 3 == 0 else 0.9)
        lines = [
            ("entrante", created * 24 - 2, "Hola, ¿qué precio tiene el {veh}?"),
            ("saliente", created * 24 - 4, "¡Hola {nombre}! Te paso la ficha completa con el precio."),
        ]
        if i % 2 == 0:
            lines.append(("entrante", created * 24 - 30, "Gracias. La verdad por ahora solo miraba, cualquier cosa te escribo."))
        script(c, lines)
        cold.append(c)

    # --- H) Compradores (5): compraron los vendidos
    buyers = []
    for _i, vehicle in enumerate(sold_vehicles[:5]):
        sold_ago_days = (NOW - vehicle.sold_at).days
        c = add_customer("buyer", None, sold_ago_days + rng.randint(10, 25), status="cliente")
        c.interested_vehicle_id = vehicle.id
        c.tags = [tags["Cliente anterior"]]
        vehicle.buyer_customer_id = c.id
        base = sold_ago_days * 24
        script(c, [
            ("entrante", base + 200, f"Hola, consulto por el {vehicle.title}. ¿Está disponible?"),
            ("saliente", base + 198, "¡Hola {nombre}! Sí, disponible. ¿Querés venir a verlo?"),
            ("entrante", base + 120, "Fui a verlo y me gustó mucho. ¿Cómo seguimos para avanzar con la compra?"),
            ("saliente", base + 118, "Con una seña lo dejamos reservado y coordinamos la transferencia."),
            ("entrante", base + 30, "Listo, mañana paso a señarlo."),
            ("saliente", base - 4, f"¡Felicitaciones por tu {vehicle.title}! Cualquier cosa que necesites estamos a disposición."),
        ])
        buyers.append(c)

    # --- I) Perdidos (4)
    lost = []
    lost_specs = [(corolla_seg, 70, "Compró en otra agencia"), (p2008, 65, "No conseguía financiación"),
                  (toro, 80, "Postergó la compra"), (onix, 75, "Presupuesto insuficiente")]
    for vehicle, created, reason in lost_specs:
        c = add_customer("lost", vehicle, created, status="perdido", budget_factor=0.85)
        c._lost_reason = reason
        script(c, [
            ("entrante", created * 24 - 5, "Hola, ¿está disponible el {veh}?"),
            ("saliente", created * 24 - 7, "¡Hola {nombre}! Sí, disponible."),
            ("entrante", (created - 10) * 24, "La verdad lo pienso mejor y por ahora no me interesa avanzar. ¡Gracias igual!"),
        ])
        lost.append(c)

    db.flush()

    print("→ Oportunidades…")

    def open_opportunity(customer: Customer, stage_key: str, extra_days_ago: float = 0) -> Opportunity:
        vehicle = customer.interested_vehicle
        stage = stages[stage_key]
        opp = Opportunity(
            organization_id=org.id,
            customer_id=customer.id,
            vehicle_id=vehicle.id if vehicle else None,
            owner_user_id=customer.assigned_user_id,
            stage_id=stage.id,
            probability=stage.probability,
            expected_value=(vehicle.price if vehicle else customer.budget) or None,
            source=customer.source,
            created_at=customer.created_at,
            expected_close_date=NOW + timedelta(days=rng.randint(3, 20)) if stage_key in ("negociacion", "reserva") else None,
        )
        db.add(opp)
        db.flush()
        # Historia de etapas: camino desde "nuevo" hasta la actual.
        path = [s for s in DEFAULT_PIPELINE_STAGES if not s.get("is_won") and not s.get("is_lost")]
        target_position = stages[stage_key].position
        walked = [s["key"] for s in path if stages[s["key"]].position <= target_position]
        start = customer.created_at
        span_hours = max(6.0, (NOW - start).total_seconds() / 3600 - 12 - extra_days_ago * 24)
        previous = None
        for i, key in enumerate(walked):
            at = start + timedelta(hours=span_hours * (i / max(1, len(walked) - 1)) if len(walked) > 1 else 1)
            db.add(
                OpportunityStageHistory(
                    organization_id=org.id, opportunity_id=opp.id,
                    from_stage_id=stages[previous].id if previous else None,
                    to_stage_id=stages[key].id,
                    user_id=customer.assigned_user_id,
                    created_at=at,
                )
            )
            previous = key
        return opp

    for c in hot_financing:
        open_opportunity(c, "negociacion")
    open_opportunity(hot_reserva[0], "reserva")
    open_opportunity(hot_reserva[1], "negociacion")
    for i, c in enumerate(hot_tradein):
        open_opportunity(c, "visita" if i % 2 == 0 else "calificado")
    for i, c in enumerate(warm):
        open_opportunity(c, ("interesado", "calificado", "contactado")[i % 3])
    for i, c in enumerate(ghosted):
        open_opportunity(c, ("interesado", "calificado")[i % 2])
    for c in new_leads:
        open_opportunity(c, "nuevo")
    for i, c in enumerate(cold):
        open_opportunity(c, "contactado" if i % 2 == 0 else "interesado")

    # Ganadas (ventas históricas)
    for c, vehicle in zip(buyers, sold_vehicles[:5], strict=False):
        stage = stages["vendido"]
        opp = Opportunity(
            organization_id=org.id, customer_id=c.id, vehicle_id=vehicle.id,
            owner_user_id=c.assigned_user_id, stage_id=stage.id, probability=100,
            status="ganada", expected_value=vehicle.sold_price, source=c.source,
            created_at=vehicle.entry_date + timedelta(days=2), closed_at=vehicle.sold_at,
            health="green",
        )
        db.add(opp)
        db.flush()
        walked = ["nuevo", "contactado", "interesado", "visita", "negociacion", "reserva", "vendido"]
        start = opp.created_at
        total_hours = (vehicle.sold_at - start).total_seconds() / 3600
        previous = None
        for i, key in enumerate(walked):
            at = start + timedelta(hours=total_hours * i / (len(walked) - 1))
            db.add(
                OpportunityStageHistory(
                    organization_id=org.id, opportunity_id=opp.id,
                    from_stage_id=stages[previous].id if previous else None,
                    to_stage_id=stages[key].id, user_id=c.assigned_user_id, created_at=at,
                )
            )
            previous = key

    # Ventas viejas sin cliente activo (para series de 6 meses)
    for vehicle in sold_vehicles[5:]:
        seller = rng.choice(sellers)
        ghost_buyer = Customer(
            organization_id=org.id, first_name=rng.choice(("Roberto", "Silvia", "Óscar")),
            last_name=rng.choice(("Domínguez", "Blanco", "Farías")), phone=_phone(),
            source=rng.choice(("mercadolibre", "whatsapp", "presencial")), status="cliente",
            assigned_user_id=seller.id, created_at=vehicle.entry_date,
            lead_score=70, score_label="caliente",
        )
        db.add(ghost_buyer)
        db.flush()
        vehicle.buyer_customer_id = ghost_buyer.id
        opp = Opportunity(
            organization_id=org.id, customer_id=ghost_buyer.id, vehicle_id=vehicle.id,
            owner_user_id=seller.id, stage_id=stages["vendido"].id, probability=100,
            status="ganada", expected_value=vehicle.sold_price, source=ghost_buyer.source,
            created_at=vehicle.entry_date + timedelta(days=3), closed_at=vehicle.sold_at, health="green",
        )
        db.add(opp)
        db.flush()
        db.add(
            OpportunityStageHistory(
                organization_id=org.id, opportunity_id=opp.id, from_stage_id=None,
                to_stage_id=stages["vendido"].id, user_id=seller.id, created_at=vehicle.sold_at,
            )
        )

    # Perdidas
    for c in lost:
        stage = stages["perdido"]
        opp = Opportunity(
            organization_id=org.id, customer_id=c.id, vehicle_id=c.interested_vehicle_id,
            owner_user_id=c.assigned_user_id, stage_id=stage.id, probability=0,
            status="perdida", expected_value=c.interested_vehicle.price if c.interested_vehicle else None,
            source=c.source, lost_reason=c._lost_reason,
            created_at=c.created_at, closed_at=c.created_at + timedelta(days=rng.randint(5, 15)),
            health="red",
        )
        db.add(opp)
        db.flush()
        db.add(
            OpportunityStageHistory(
                organization_id=org.id, opportunity_id=opp.id, from_stage_id=stages["interesado"].id,
                to_stage_id=stage.id, user_id=c.assigned_user_id, created_at=opp.closed_at,
            )
        )

    db.flush()

    print("→ Seguimientos, tareas y citas…")
    followup_notes = {
        "hot_financing": "Enviar simulación de financiación y coordinar visita",
        "hot_reserva": "Confirmar seña y preparar documentación",
        "hot_tradein": "Coordinar tasación de la permuta",
        "warm": "Retomar conversación y ofrecer visita",
        "ghosted": "Reintentar contacto — mostró alto interés",
        "new": "Primer contacto del lead",
        "cold": "Contacto de mantenimiento",
    }

    def add_followup(customer: Customer, due_hours_from_now: float, type_: str, status: str = "pendiente", priority: str = "media", origin: str = "manual", note: str | None = None, reason: str | None = None):
        due = NOW + timedelta(hours=due_hours_from_now)
        f = Followup(
            organization_id=org.id, customer_id=customer.id, user_id=customer.assigned_user_id,
            due_at=due, type=type_, priority=priority, status=status, origin=origin,
            note=note or followup_notes.get(getattr(customer, "_archetype", ""), "Seguimiento"),
            suggested_reason=reason,
            completed_at=due if status == "completado" else None,
            created_at=NOW - timedelta(days=rng.uniform(0.5, 3)),
        )
        db.add(f)
        return f

    # Vencidos (5)
    add_followup(ghosted[0], -30, "llamada", priority="alta")
    add_followup(ghosted[1], -52, "whatsapp", priority="alta")
    add_followup(ghosted[2], -80, "llamada")
    add_followup(warm[3], -26, "whatsapp")
    add_followup(warm[7], -100, "email")
    # Hoy (6)
    add_followup(hot_financing[0], 1.5, "whatsapp", priority="alta")
    add_followup(hot_financing[1], 3, "llamada", priority="alta")
    add_followup(hot_reserva[0], 2, "llamada", priority="alta")
    add_followup(hot_tradein[0], 4.5, "whatsapp")
    add_followup(warm[0], 6, "llamada")
    add_followup(new_leads[3], 5, "whatsapp", priority="alta")
    # Próximos (8)
    for i, c in enumerate((warm[1], warm[2], warm[4], warm[5], hot_tradein[1], hot_tradein[2], ghosted[3], cold[0])):
        add_followup(c, 24 * (i % 6 + 1) + rng.uniform(0, 8), rng.choice(("llamada", "whatsapp", "email")))
    # Completados (6)
    for c in (hot_financing[0], hot_reserva[0], warm[0], warm[6], buyers[0], buyers[1]):
        add_followup(c, -rng.uniform(48, 200), rng.choice(("llamada", "whatsapp")), status="completado")
    # Sugeridos por POPS (§16) — de los mensajes "escribime la semana que viene"
    monday = NOW + timedelta(days=(7 - NOW.weekday()) % 7 or 7)
    for c in (warm[3], warm[7]):
        add_followup(
            c, (monday - NOW).total_seconds() / 3600, "whatsapp", status="sugerido", origin="ia",
            note=f"Retomar contacto con {c.first_name}",
            reason="El cliente escribió “la semana que viene”",
        )

    db.flush()
    # next_followup_at por cliente
    for c in customers:
        c.next_followup_at = db.scalar(
            select(Followup.due_at).where(Followup.customer_id == c.id, Followup.status == "pendiente").order_by(Followup.due_at).limit(1)
        )

    # Tareas
    tasks_spec = [
        (users["lucas"], hot_tradein[0], "Tasar la permuta de {c}", "seguimiento", -20, "alta"),
        (users["sofia"], ghosted[1], "Llamar a {c} — sin respuesta hace días", "llamada", -6, "alta"),
        (users["lucas"], hot_financing[0], "Armar simulación de financiación para {c}", "administrativo", 3, "alta"),
        (users["diego"], warm[2], "Enviar fotos adicionales del vehículo a {c}", "mensaje", 8, "media"),
        (users["sofia"], None, "Actualizar fotos del Gol Trend (95 días en stock)", "administrativo", 30, "media"),
        (users["gerente"], None, "Revisar precios del stock con más de 60 días", "administrativo", 50, "media"),
    ]
    for user, customer, title, type_, due_hours, priority in tasks_spec:
        db.add(
            Task(
                organization_id=org.id, user_id=user.id,
                customer_id=customer.id if customer else None,
                title=title.format(c=customer.full_name if customer else ""),
                type=type_, due_at=NOW + timedelta(hours=due_hours), priority=priority,
                created_at=NOW - timedelta(days=1),
            )
        )

    # Citas — hoy y próximos días (agenda §7 / calendario §32)
    appointments_spec = [
        (hot_financing[0], corolla_xei, users["lucas"], "Visita de {c} — Corolla XEI", "visita", 4),
        (hot_reserva[0], hilux, users["sofia"], "Test drive Hilux con {c}", "test_drive", 7),
        (hot_tradein[0], ranger, users["lucas"], "Tasación permuta de {c}", "visita", 26),
        (hot_reserva[1], taos, users["diego"], "Seña Taos — {c}", "reunion", 30),
        (warm[0], corolla_seg, users["diego"], "Visita de {c}", "visita", 52),
        (buyers[0], sold_vehicles[0], users["lucas"], "Entrega del vehículo a {c}", "entrega", -24 * 14),
    ]
    for customer, vehicle, user, title, type_, hours_from_now in appointments_spec:
        starts = NOW + timedelta(hours=hours_from_now)
        db.add(
            Appointment(
                organization_id=org.id, customer_id=customer.id, vehicle_id=vehicle.id, user_id=user.id,
                title=title.format(c=customer.full_name), type=type_,
                starts_at=starts, ends_at=starts + timedelta(hours=1),
                location="Sucursal Centro",
                status="completada" if hours_from_now < 0 else "agendada",
            )
        )

    print("→ Comercial: permutas, financiación, cotizaciones…")
    for c in hot_tradein:
        brand, model, version, year, km = c._trade
        db.add(
            TradeIn(
                organization_id=org.id, customer_id=c.id, brand=brand, model=model, version=version,
                year=year, km=km, plate=_plate(), condition="Muy bueno, detalles de uso",
                estimated_value=round(rng.uniform(8000, 15000), -2),
                offered_value=round(rng.uniform(7500, 14000), -2),
                status=rng.choice(("pendiente", "tasado")),
            )
        )

    financing_rows = []
    for c in hot_financing[:2]:
        vehicle = c.interested_vehicle
        price = vehicle.price
        down = round(price * 0.4, -2)
        financed = price - down
        rate = 38.0
        monthly = financed * (rate / 100 / 12) / (1 - (1 + rate / 100 / 12) ** -24)
        scenario = FinancingScenario(
            organization_id=org.id, customer_id=c.id, vehicle_id=vehicle.id,
            vehicle_price=price, down_payment=down, financed_amount=financed,
            installments=24, annual_rate=rate, monthly_payment=round(monthly, 2),
            created_by=c.assigned_user_id, created_at=d(1),
        )
        db.add(scenario)
        financing_rows.append(scenario)
    db.flush()

    quote_specs = [(hot_reserva[0], hilux, 500), (hot_reserva[1], taos, 400), (hot_financing[0], corolla_xei, 300)]
    for number, (customer, vehicle, discount) in enumerate(quote_specs, start=1):
        db.add(
            Quote(
                organization_id=org.id, number=number, customer_id=customer.id, vehicle_id=vehicle.id,
                user_id=customer.assigned_user_id, price=vehicle.price, discount=discount,
                trade_in_value=0, expenses=350, total=vehicle.price - discount + 350,
                status="enviada", valid_until=NOW + timedelta(days=7),
                notes="Incluye gestoría y verificación. Precio congelado por 7 días.",
                created_at=d(rng.uniform(0.5, 2)),
            )
        )

    print("→ Notas y auditoría…")
    notes_spec = [
        (hot_reserva[0], users["sofia"], "Quiere la Hilux para su campo en Cañuelas. Tiene el efectivo, solo falta definir fecha de seña.", True),
        (hot_financing[0], users["lucas"], "Trabaja en relación de dependencia, recibo de sueldo OK para financiación bancaria.", False),
        (hot_tradein[0], users["lucas"], "La Amarok que entrega tiene detalles de chapa en puerta trasera. Considerar en la tasación.", False),
        (ghosted[0], users["sofia"], "Venía muy bien, dejó de contestar de golpe. Probar llamada en horario laboral.", True),
    ]
    for customer, user, body, pinned in notes_spec:
        db.add(
            CustomerNote(
                organization_id=org.id, customer_id=customer.id, user_id=user.id,
                body=body, pinned=pinned, created_at=NOW - timedelta(days=rng.uniform(0.5, 4)),
            )
        )

    audit.log(db, org.id, "vehiculo_creado", "vehicle", taos.id, users["gerente"].id, {"titulo": taos.title})
    audit.log(db, org.id, "cliente_creado", "customer", new_leads[0].id, users["gerente"].id, {"nombre": new_leads[0].full_name})
    audit.log(db, org.id, "vehiculo_precio", "vehicle", by_key["Citroën C4 Cactus Feel Pack"].id, users["gerente"].id, {"precio_anterior": 14500, "precio_nuevo": 13900})

    print("→ Automatizaciones…")
    automations_spec = [
        (
            "Asignar leads nuevos",
            "Cuando entra un lead sin vendedor, lo asigna por round-robin y avisa.",
            "lead.created",
            [{"field": "sin_vendedor"}],
            [{"type": "assign_round_robin"}],
        ),
        (
            "Rescatar clientes calientes inactivos",
            "Si un cliente con score alto queda 72 h sin actividad, crea una tarea urgente.",
            "inactivity.72h",
            [{"field": "score", "op": "gt", "value": 60}],
            [{"type": "create_task", "params": {"title": "Rescatar a {nombre} — 72 h sin actividad", "priority": "alta", "due_in_hours": 6}}],
        ),
        (
            "Matching de ingresos nuevos",
            "Cuando ingresa un vehículo, busca clientes compatibles y notifica a los vendedores.",
            "vehicle.created",
            [],
            [{"type": "run_matching"}],
        ),
    ]
    for name, description, trigger, conditions, actions in automations_spec:
        db.add(
            Automation(
                organization_id=org.id, name=name, description=description,
                trigger=trigger, conditions=conditions, actions=actions, enabled=True,
            )
        )

    print("→ Segmentos…")
    db.add(Segment(organization_id=org.id, user_id=None, name="Calientes sin respuesta", entity="customers", filters={"score_label": "caliente", "awaiting_reply": True}))
    db.add(Segment(organization_id=org.id, user_id=None, name="Interesados en SUV", entity="customers", filters={"interest_body_type": "suv"}))
    db.add(Segment(organization_id=org.id, user_id=None, name="Presupuesto > 25k", entity="customers", filters={"min_budget": 25000}))

    print("→ Scoring real sobre las conversaciones…")
    db.flush()
    for c in customers:
        if c.status in ("cliente",):
            c.lead_score = rng.randint(80, 95)
            c.score_label = "cierre"
            c.score_reason = "Compró un vehículo"
            continue
        # Historia sintética previa para clientes calientes (progresión visible §11).
        if getattr(c, "_archetype", "") in ("hot_financing", "hot_reserva", "hot_tradein"):
            step1 = rng.randint(45, 55)
            step2 = rng.randint(60, 72)
            db.add(LeadScoreHistory(organization_id=org.id, customer_id=c.id, old_score=25, new_score=step1, reason="Consultó disponibilidad", factors=[], created_at=c.created_at + timedelta(hours=6)))
            db.add(LeadScoreHistory(organization_id=org.id, customer_id=c.id, old_score=step1, new_score=step2, reason="Preguntó por financiación" if c._archetype == "hot_financing" else "Pidió ver el vehículo", factors=[], created_at=NOW - timedelta(days=1)))
            c.lead_score = step2
        scoring.apply_score(db, c)

    print("→ Matching de stock…")
    for c in customers:
        if c.status in ("lead", "activo"):
            matching.run_matching_for_customer(db, c)
    # El Taos entró hace 3 días: matching como "nuevo ingreso" (notifica a vendedores).
    matching.run_matching_for_vehicle(db, taos)

    print("→ Salud de oportunidades…")
    db.flush()
    for opp in db.scalars(select(Opportunity).where(Opportunity.status == "abierta")).all():
        refresh_health(db, opp)

    print("→ Insights de Motor IQ…")
    insights.generate_for_org(db, org)


if __name__ == "__main__":
    run()
