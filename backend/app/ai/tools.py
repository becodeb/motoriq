"""Tools controladas para el chat con datos (§41, §42).

El LLM nunca toca SQL: solo puede llamar estas funciones, que consultan
datos reales de la organización del usuario. Las acciones de escritura se
limitan a crear seguimientos/tareas (internas y reversibles).
"""

from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.ai.base import ToolSpec
from app.core.utils import normalize, utcnow
from app.models import (
    Customer,
    CustomerNote,
    Followup,
    Opportunity,
    Organization,
    Task,
    User,
    Vehicle,
)
from app.services import analytics, stock_intel

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        "search_customers",
        "Busca clientes de la agencia. Usala para responder preguntas sobre clientes, leads, scores o seguimiento.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Texto a buscar en nombre, teléfono o email"},
                "status": {"type": "string", "enum": ["lead", "activo", "cliente", "perdido", "inactivo"]},
                "min_score": {"type": "integer", "description": "Score mínimo (0-100)"},
                "awaiting_reply": {"type": "boolean", "description": "Solo clientes esperando respuesta nuestra"},
                "financing_interest": {"type": "boolean", "description": "Solo clientes que preguntaron financiación"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    ),
    ToolSpec(
        "get_customer",
        "Trae el detalle completo de un cliente por id, incluyendo últimos mensajes.",
        {
            "type": "object",
            "properties": {"customer_id": {"type": "string"}},
            "required": ["customer_id"],
        },
    ),
    ToolSpec(
        "search_vehicles",
        "Busca vehículos del stock con filtros.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "status": {"type": "string", "enum": ["disponible", "reservado", "vendido", "preparacion", "pausado"]},
                "brand": {"type": "string"},
                "max_price": {"type": "number"},
                "min_year": {"type": "integer"},
                "body_type": {"type": "string", "enum": ["sedan", "hatchback", "suv", "pickup", "coupe", "furgon", "otro"]},
                "min_days_in_stock": {"type": "integer", "description": "Solo vehículos con al menos N días en stock"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    ),
    ToolSpec(
        "get_vehicle",
        "Detalle de un vehículo por id, con consultas e interesados.",
        {"type": "object", "properties": {"vehicle_id": {"type": "string"}}, "required": ["vehicle_id"]},
    ),
    ToolSpec(
        "get_followups",
        "Lista seguimientos: vencidos, de hoy, de la semana o sugeridos por Motor IQ. Opcionalmente por vendedor.",
        {
            "type": "object",
            "properties": {
                "scope": {"type": "string", "enum": ["vencidos", "hoy", "semana", "sugeridos"]},
                "seller_name": {"type": "string", "description": "Nombre del vendedor para filtrar"},
            },
            "required": ["scope"],
        },
    ),
    ToolSpec(
        "get_opportunities",
        "Lista oportunidades del pipeline, filtrables por etapa y estado.",
        {
            "type": "object",
            "properties": {
                "stage_key": {"type": "string", "enum": ["nuevo", "contactado", "interesado", "calificado", "visita", "negociacion", "reserva", "vendido", "perdido"]},
                "status": {"type": "string", "enum": ["abierta", "ganada", "perdida"]},
                "seller_name": {"type": "string"},
            },
        },
    ),
    ToolSpec(
        "get_sales_metrics",
        "Métricas comerciales del período: leads, ventas, facturación, conversión, tiempos.",
        {
            "type": "object",
            "properties": {"range": {"type": "string", "enum": ["hoy", "7d", "30d", "mes", "trimestre", "ano"], "default": "30d"}},
        },
    ),
    ToolSpec(
        "get_stock_intelligence",
        "Inteligencia de stock: autos más consultados, estancados, rotación y demanda por precio.",
        {"type": "object", "properties": {}},
    ),
    ToolSpec(
        "create_followup",
        "Crea un seguimiento para un cliente. Usala solo si el usuario lo pide explícitamente.",
        {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
                "due_at": {"type": "string", "description": "Fecha/hora ISO 8601 en UTC"},
                "type": {"type": "string", "enum": ["whatsapp", "llamada", "email", "visita", "recordatorio", "tarea"], "default": "llamada"},
                "note": {"type": "string"},
            },
            "required": ["customer_id", "due_at"],
        },
    ),
    ToolSpec(
        "create_task",
        "Crea una tarea. Usala solo si el usuario lo pide explícitamente.",
        {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "customer_id": {"type": "string"},
                "due_at": {"type": "string", "description": "ISO 8601 UTC"},
                "priority": {"type": "string", "enum": ["baja", "media", "alta"], "default": "media"},
            },
            "required": ["title"],
        },
    ),
]

# Solo gerencia: datos del equipo (nombres, contacto, carga de trabajo, ventas).
TEAM_TOOL = ToolSpec(
    "get_team",
    "Información del equipo de la agencia: nombre y apellido de cada empleado, email, teléfono, rol, "
    "si está activo, último acceso, clientes activos a cargo, seguimientos vencidos y ventas del mes.",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Filtrar por nombre o apellido (opcional)"},
        },
    },
)


def tool_specs_for(user: User) -> list[ToolSpec]:
    """Tools disponibles según el rol: gerencia ve también los datos del equipo."""
    specs = list(TOOL_SPECS)
    if user.role in ("admin", "gerente"):
        specs.append(TEAM_TOOL)
    return specs


def _customer_row(c: Customer) -> dict:
    return {
        "id": c.id,
        "nombre": c.full_name,
        "telefono": c.phone,
        "estado": c.status,
        "score": c.lead_score,
        "clasificacion": c.score_label,
        "motivo_score": c.score_reason,
        "vehiculo_interes": c.interested_vehicle.title if c.interested_vehicle else (
            f"{c.interest_brand or ''} {c.interest_model or ''}".strip() or None
        ),
        "presupuesto": c.budget,
        "vendedor": c.assigned_user.full_name if c.assigned_user else None,
        "esperando_respuesta": c.awaiting_reply,
        "ultimo_contacto": c.last_contact_at.isoformat() if c.last_contact_at else None,
        "proximo_seguimiento": c.next_followup_at.isoformat() if c.next_followup_at else None,
    }


def _vehicle_row(v: Vehicle, inquiries: int | None = None) -> dict:
    row = {
        "id": v.id,
        "titulo": f"{v.title} {v.year}",
        "precio": v.price,
        "km": v.km,
        "estado": v.status,
        "carroceria": v.body_type,
        "transmision": v.transmission,
        "dias_en_stock": v.days_in_stock,
    }
    if inquiries is not None:
        row["consultas"] = inquiries
    return row


def execute_tool(db: Session, org: Organization, user: User, name: str, args: dict) -> tuple[dict | list, str]:
    """Devuelve (resultado JSON-safe, resumen legible para la UI)."""
    if name == "search_customers":
        query = select(Customer).where(
            Customer.organization_id == org.id, Customer.deleted_at.is_(None)
        )
        if args.get("query"):
            q = f"%{args['query']}%"
            query = query.where(
                or_(
                    (Customer.first_name + " " + Customer.last_name).ilike(q),
                    Customer.phone.ilike(q),
                    Customer.email.ilike(q),
                )
            )
        if args.get("status"):
            query = query.where(Customer.status == args["status"])
        if args.get("min_score"):
            query = query.where(Customer.lead_score >= args["min_score"])
        if args.get("awaiting_reply"):
            query = query.where(
                Customer.last_inbound_at.isnot(None),
                or_(Customer.last_outbound_at.is_(None), Customer.last_inbound_at > Customer.last_outbound_at),
            )
        limit = min(int(args.get("limit") or 10), 25)
        rows = db.scalars(query.order_by(Customer.lead_score.desc()).limit(limit * 3)).all()
        if args.get("financing_interest"):
            rows = [c for c in rows if c.financing_interest or any(
                f.get("label") == "Preguntó por financiación" for f in (c.score_factors or [])
            )]
        rows = rows[:limit]
        return [_customer_row(c) for c in rows], f"Busqué clientes ({len(rows)} resultados)"

    if name == "get_customer":
        c = db.get(Customer, args.get("customer_id", ""))
        if not c or c.organization_id != org.id:
            return {"error": "cliente no encontrado"}, "Cliente no encontrado"
        from app.models import Message

        messages = db.scalars(
            select(Message).where(Message.customer_id == c.id).order_by(Message.created_at.desc()).limit(10)
        ).all()
        detail = _customer_row(c)
        detail["resumen_ia"] = c.ai_summary
        detail["notas"] = c.notes
        internal_notes = db.scalars(
            select(CustomerNote)
            .where(CustomerNote.customer_id == c.id)
            .order_by(CustomerNote.pinned.desc(), CustomerNote.created_at.desc())
            .limit(5)
        ).all()
        detail["notas_internas"] = [
            {"nota": n.body[:300], "autor": n.user.full_name if n.user else None, "fijada": n.pinned}
            for n in internal_notes
        ]
        detail["mensajes_recientes"] = [
            {"quien": "cliente" if m.direction == "entrante" else "agencia", "texto": m.body[:300], "fecha": m.created_at.isoformat()}
            for m in reversed(messages)
        ]
        return detail, f"Revisé la ficha de {c.full_name}"

    if name == "search_vehicles":
        query = select(Vehicle).where(Vehicle.organization_id == org.id, Vehicle.deleted_at.is_(None))
        if args.get("query"):
            q = f"%{args['query']}%"
            query = query.where(or_((Vehicle.brand + " " + Vehicle.model).ilike(q), Vehicle.version.ilike(q)))
        if args.get("status"):
            query = query.where(Vehicle.status == args["status"])
        if args.get("brand"):
            query = query.where(Vehicle.brand.ilike(f"%{args['brand']}%"))
        if args.get("max_price"):
            query = query.where(Vehicle.price <= args["max_price"])
        if args.get("min_year"):
            query = query.where(Vehicle.year >= args["min_year"])
        if args.get("body_type"):
            query = query.where(Vehicle.body_type == args["body_type"])
        limit = min(int(args.get("limit") or 10), 25)
        rows = db.scalars(query.limit(100)).all()
        if args.get("min_days_in_stock"):
            rows = [v for v in rows if v.days_in_stock >= args["min_days_in_stock"]]
        inquiries = stock_intel.inquiries_map(db, org.id)
        rows = rows[:limit]
        return [_vehicle_row(v, inquiries.get(v.id, 0)) for v in rows], f"Busqué vehículos ({len(rows)} resultados)"

    if name == "get_vehicle":
        v = db.get(Vehicle, args.get("vehicle_id", ""))
        if not v or v.organization_id != org.id:
            return {"error": "vehículo no encontrado"}, "Vehículo no encontrado"
        customers_map = stock_intel.vehicle_inquiry_customers(db, org.id)
        interested_ids = customers_map.get(v.id, set())
        interested = db.scalars(select(Customer).where(Customer.id.in_(interested_ids)).limit(10)).all() if interested_ids else []
        detail = _vehicle_row(v, len(interested_ids))
        detail["interesados"] = [{"id": c.id, "nombre": c.full_name, "score": c.lead_score} for c in interested]
        return detail, f"Consulté el {v.title}"

    if name == "get_followups":
        now = utcnow()
        scope = args.get("scope", "hoy")
        query = select(Followup).where(Followup.organization_id == org.id)
        if scope == "vencidos":
            query = query.where(Followup.status == "pendiente", Followup.due_at < now)
        elif scope == "hoy":
            query = query.where(Followup.status == "pendiente", Followup.due_at >= now - timedelta(hours=12), Followup.due_at < now + timedelta(hours=24))
        elif scope == "semana":
            query = query.where(Followup.status == "pendiente", Followup.due_at < now + timedelta(days=7))
        elif scope == "sugeridos":
            query = query.where(Followup.status == "sugerido")
        if args.get("seller_name"):
            q = f"%{args['seller_name']}%"
            query = query.join(User, User.id == Followup.user_id).where(
                (User.first_name + " " + User.last_name).ilike(q)
            )
        rows = db.scalars(query.order_by(Followup.due_at).limit(25)).all()
        return [
            {
                "id": f.id,
                "cliente": f.customer.full_name if f.customer else None,
                "customer_id": f.customer_id,
                "vendedor": f.user.full_name if f.user else None,
                "fecha": f.due_at.isoformat(),
                "tipo": f.type,
                "estado": f.status,
                "vencido": f.status == "pendiente" and f.due_at < now,
                "nota": f.note,
            }
            for f in rows
        ], f"Consulté seguimientos ({scope}: {len(rows)})"

    if name == "get_opportunities":
        from app.models import PipelineStage

        query = select(Opportunity).where(Opportunity.organization_id == org.id)
        if args.get("stage_key"):
            query = query.join(PipelineStage, PipelineStage.id == Opportunity.stage_id).where(
                PipelineStage.key == args["stage_key"]
            )
        if args.get("status"):
            query = query.where(Opportunity.status == args["status"])
        else:
            query = query.where(Opportunity.status == "abierta")
        if args.get("seller_name"):
            q = f"%{args['seller_name']}%"
            query = query.join(User, User.id == Opportunity.owner_user_id).where(
                (User.first_name + " " + User.last_name).ilike(q)
            )
        rows = db.scalars(query.order_by(Opportunity.updated_at.desc()).limit(25)).all()
        return [
            {
                "id": o.id,
                "cliente": o.customer.full_name if o.customer else None,
                "customer_id": o.customer_id,
                "vehiculo": o.vehicle.title if o.vehicle else None,
                "etapa": o.stage.name if o.stage else None,
                "valor_estimado": o.expected_value,
                "probabilidad": o.probability,
                "salud": o.health,
                "vendedor": o.owner.full_name if o.owner else None,
            }
            for o in rows
        ], f"Consulté oportunidades ({len(rows)})"

    if name == "get_sales_metrics":
        data = analytics.overview(db, org, args.get("range", "30d"), None, None)
        compact = {
            "leads": data["leads"]["value"],
            "contactados": data["contacted"]["value"],
            "oportunidades": data["opportunities"]["value"],
            "reservas": data["reservations"]["value"],
            "ventas": data["sales"]["value"],
            "facturacion": data["revenue"]["value"],
            "conversion_pct": data["conversion_rate"]["value"],
            "ticket_promedio": data["avg_ticket"]["value"],
            "primera_respuesta_min": data["avg_first_response_minutes"]["value"],
            "dias_hasta_venta": data["avg_days_to_sale"]["value"],
            "seguimientos_vencidos": data["followups_overdue"],
        }
        return compact, f"Consulté métricas ({args.get('range', '30d')})"

    if name == "get_stock_intelligence":
        data = stock_intel.stock_intelligence(db, org.id, org.currency)
        compact = {
            "mas_consultados": [
                {"vehiculo": f"{s['vehicle'].title} {s['vehicle'].year}", "consultas": s["inquiries"], "dias": s["days_in_stock"]}
                for s in data["most_inquired"][:6]
            ],
            "estancados": [
                {"vehiculo": f"{s['vehicle'].title} {s['vehicle'].year}", "dias": s["days_in_stock"], "consultas": s["inquiries"]}
                for s in data["stale"][:6]
            ],
            "promedio_dias_stock": data["avg_days_in_stock"],
            "promedio_dias_vendidos": data["avg_days_sold"],
            "consultas_por_marca": data["inquiries_by_brand"][:6],
            "consultas_por_precio": data["inquiries_by_price_range"],
        }
        return compact, "Consulté inteligencia de stock"

    if name == "create_followup":
        c = db.get(Customer, args.get("customer_id", ""))
        if not c or c.organization_id != org.id:
            return {"error": "cliente no encontrado"}, "Cliente no encontrado"
        try:
            due = datetime.fromisoformat(str(args["due_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, KeyError):
            return {"error": "fecha inválida, usar ISO 8601"}, "Fecha inválida"
        followup = Followup(
            organization_id=org.id,
            customer_id=c.id,
            user_id=user.id,
            due_at=due,
            type=args.get("type", "llamada"),
            note=args.get("note"),
            origin="ia",
            status="pendiente",
        )
        db.add(followup)
        db.flush()
        c.next_followup_at = min(c.next_followup_at, due) if c.next_followup_at and c.next_followup_at > utcnow() else due
        return {"ok": True, "followup_id": followup.id, "fecha": due.isoformat()}, f"Creé un seguimiento para {c.full_name}"

    if name == "create_task":
        due = None
        if args.get("due_at"):
            try:
                due = datetime.fromisoformat(str(args["due_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                due = None
        task = Task(
            organization_id=org.id,
            user_id=user.id,
            customer_id=args.get("customer_id"),
            title=str(args.get("title", "Tarea"))[:200],
            due_at=due,
            priority=args.get("priority", "media"),
            origin="ia",
        )
        db.add(task)
        db.flush()
        return {"ok": True, "task_id": task.id}, f"Creé la tarea “{task.title}”"

    if name == "get_team":
        # Defensa en profundidad: además de no ofrecerse la tool a vendedores,
        # se rechaza la ejecución si llegara a invocarse igual.
        if user.role not in ("admin", "gerente"):
            return {"error": "la información del equipo es solo para gerencia"}, "Información reservada a gerencia"
        now = utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        members = db.scalars(
            select(User).where(User.organization_id == org.id).order_by(User.created_at)
        ).all()
        query_text = normalize(args.get("query") or "")
        rows = []
        for member in members:
            if query_text and query_text not in normalize(member.full_name):
                continue
            active_customers = db.scalar(
                select(func.count(Customer.id)).where(
                    Customer.organization_id == org.id,
                    Customer.assigned_user_id == member.id,
                    Customer.status.in_(("lead", "activo")),
                    Customer.deleted_at.is_(None),
                )
            ) or 0
            overdue = db.scalar(
                select(func.count(Followup.id)).where(
                    Followup.organization_id == org.id,
                    Followup.user_id == member.id,
                    Followup.status == "pendiente",
                    Followup.due_at < now,
                )
            ) or 0
            won_month = db.scalars(
                select(Opportunity).where(
                    Opportunity.organization_id == org.id,
                    Opportunity.owner_user_id == member.id,
                    Opportunity.status == "ganada",
                    Opportunity.closed_at >= month_start,
                )
            ).all()
            rows.append(
                {
                    "nombre": member.first_name,
                    "apellido": member.last_name,
                    "nombre_completo": member.full_name,
                    "email": member.email,
                    "telefono": member.phone,
                    "rol": member.role,
                    "activo": member.is_active,
                    "ultimo_acceso": member.last_login_at.isoformat() if member.last_login_at else None,
                    "clientes_activos_a_cargo": active_customers,
                    "seguimientos_vencidos": overdue,
                    "ventas_este_mes": len(won_month),
                    "facturacion_este_mes": sum(o.expected_value or 0 for o in won_month),
                }
            )
        return rows, f"Revisé el equipo ({len(rows)} persona{'s' if len(rows) != 1 else ''})"

    return {"error": f"acción desconocida: {name}"}, "No pude hacer esa consulta"
