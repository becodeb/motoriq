"""Stock Intelligence (§22, §23, §24): demanda, rotación, precio vs interés
y recomendaciones de compra. Todo con explicación, nunca como certeza."""

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, Opportunity, Vehicle

STALE_DAYS = 60


def vehicle_inquiry_customers(db: Session, organization_id: str) -> dict[str, set[str]]:
    """vehicle_id → set de customer_ids que consultaron por él.

    Una consulta = cliente con ese vehículo como interés, o con una oportunidad sobre él.
    """
    result: dict[str, set[str]] = defaultdict(set)
    interested = db.execute(
        select(Customer.interested_vehicle_id, Customer.id).where(
            Customer.organization_id == organization_id,
            Customer.interested_vehicle_id.isnot(None),
            Customer.deleted_at.is_(None),
        )
    ).all()
    for vehicle_id, customer_id in interested:
        result[vehicle_id].add(customer_id)
    opportunities = db.execute(
        select(Opportunity.vehicle_id, Opportunity.customer_id).where(
            Opportunity.organization_id == organization_id,
            Opportunity.vehicle_id.isnot(None),
        )
    ).all()
    for vehicle_id, customer_id in opportunities:
        result[vehicle_id].add(customer_id)
    return result


def inquiries_map(db: Session, organization_id: str) -> dict[str, int]:
    return {vid: len(customers) for vid, customers in vehicle_inquiry_customers(db, organization_id).items()}


def _won_counts(db: Session, organization_id: str) -> dict[str, int]:
    rows = db.execute(
        select(Opportunity.vehicle_id, func.count(Opportunity.id))
        .where(
            Opportunity.organization_id == organization_id,
            Opportunity.status == "ganada",
            Opportunity.vehicle_id.isnot(None),
        )
        .group_by(Opportunity.vehicle_id)
    ).all()
    return dict(rows)


def _vehicle_stat(vehicle: Vehicle, inquiries: int, won: int) -> dict:
    return {
        "vehicle": vehicle,
        "inquiries": inquiries,
        "days_in_stock": vehicle.days_in_stock,
        "conversion_rate": round(won / inquiries, 3) if inquiries else None,
    }


def stock_intelligence(db: Session, organization_id: str, currency: str = "USD") -> dict:
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.organization_id == organization_id, Vehicle.deleted_at.is_(None))
    ).all()
    inquiries = inquiries_map(db, organization_id)
    won = _won_counts(db, organization_id)

    available = [v for v in vehicles if v.status in ("disponible", "reservado", "preparacion")]
    sold = [v for v in vehicles if v.status == "vendido"]

    most_inquired = sorted(
        (_vehicle_stat(v, inquiries.get(v.id, 0), won.get(v.id, 0)) for v in available),
        key=lambda s: s["inquiries"],
        reverse=True,
    )[:8]

    # Con consultas suficientes o con venta concretada (una unidad vendida cuenta como conversión).
    with_inquiries = [v for v in vehicles if inquiries.get(v.id, 0) >= 2 or won.get(v.id, 0) > 0]
    best_conversion = sorted(
        (_vehicle_stat(v, inquiries.get(v.id, 0), won.get(v.id, 0)) for v in with_inquiries),
        key=lambda s: (s["conversion_rate"] or 0, s["inquiries"]),
        reverse=True,
    )[:8]

    fastest_sold = sorted(
        (_vehicle_stat(v, inquiries.get(v.id, 0), won.get(v.id, 0)) for v in sold),
        key=lambda s: s["days_in_stock"],
    )[:8]

    avg_inquiries = (sum(inquiries.get(v.id, 0) for v in available) / len(available)) if available else 0
    stale = sorted(
        (
            _vehicle_stat(v, inquiries.get(v.id, 0), won.get(v.id, 0))
            for v in available
            if v.days_in_stock >= STALE_DAYS and inquiries.get(v.id, 0) <= avg_inquiries
        ),
        key=lambda s: s["days_in_stock"],
        reverse=True,
    )[:8]

    by_brand: dict[str, int] = defaultdict(int)
    by_model: dict[str, int] = defaultdict(int)
    for v in vehicles:
        count = inquiries.get(v.id, 0)
        if count:
            by_brand[v.brand] += count
            by_model[f"{v.brand} {v.model}"] += count

    bands = _price_bands(currency)
    by_price: list[dict] = []
    for label, low, high in bands:
        in_band = [v for v in vehicles if low <= v.price < high]
        by_price.append(
            {
                "range": label,
                "inquiries": sum(inquiries.get(v.id, 0) for v in in_band),
                "vehicles": len(in_band),
            }
        )

    return {
        "most_inquired": most_inquired,
        "best_conversion": best_conversion,
        "fastest_sold": fastest_sold,
        "stale": stale,
        "avg_days_in_stock": round(sum(v.days_in_stock for v in available) / len(available), 1) if available else 0,
        "avg_days_sold": round(sum(v.days_in_stock for v in sold) / len(sold), 1) if sold else None,
        "inquiries_by_brand": sorted(
            ({"name": k, "inquiries": n} for k, n in by_brand.items()), key=lambda x: x["inquiries"], reverse=True
        )[:10],
        "inquiries_by_model": sorted(
            ({"name": k, "inquiries": n} for k, n in by_model.items()), key=lambda x: x["inquiries"], reverse=True
        )[:10],
        "inquiries_by_price_range": by_price,
    }


def _price_bands(currency: str) -> list[tuple[str, float, float]]:
    if currency.upper() in ("ARS",):
        million = 1_000_000
        return [
            ("< 15M", 0, 15 * million),
            ("15–25M", 15 * million, 25 * million),
            ("25–40M", 25 * million, 40 * million),
            ("40–60M", 40 * million, 60 * million),
            ("> 60M", 60 * million, 10_000 * million),
        ]
    return [
        ("< 12k", 0, 12_000),
        ("12–18k", 12_000, 18_000),
        ("18–25k", 18_000, 25_000),
        ("25–35k", 25_000, 35_000),
        ("> 35k", 35_000, 100_000_000),
    ]


def stock_recommendations(db: Session, organization_id: str) -> list[dict]:
    """¿Qué autos conviene comprar? Combina demanda histórica y velocidad de venta."""
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.organization_id == organization_id, Vehicle.deleted_at.is_(None))
    ).all()
    if not vehicles:
        return []
    inquiries = inquiries_map(db, organization_id)

    groups: dict[tuple[str, str], dict] = {}
    for v in vehicles:
        key = (v.brand, v.model)
        group = groups.setdefault(
            key,
            {"inquiries": 0, "sold": 0, "sold_days": [], "prices": [], "years": [], "in_stock": 0},
        )
        group["inquiries"] += inquiries.get(v.id, 0)
        group["prices"].append(v.price)
        group["years"].append(v.year)
        if v.status == "vendido":
            group["sold"] += 1
            group["sold_days"].append(v.days_in_stock)
        elif v.status == "disponible":
            group["in_stock"] += 1

    total_inquiries = sum(g["inquiries"] for g in groups.values()) or 1
    avg_inquiries = total_inquiries / len(groups)
    all_sold_days = [d for g in groups.values() for d in g["sold_days"]]
    avg_sold_days = sum(all_sold_days) / len(all_sold_days) if all_sold_days else None

    recommendations: list[dict] = []
    ranked = sorted(groups.items(), key=lambda kv: (kv[1]["inquiries"], kv[1]["sold"]), reverse=True)
    for (brand, model), g in ranked[:4]:
        if g["inquiries"] < max(2, avg_inquiries * 0.8):
            continue
        over_avg = round((g["inquiries"] / avg_inquiries - 1) * 100)
        year_min, year_max = min(g["years"]), max(g["years"])
        price_min, price_max = min(g["prices"]), max(g["prices"])
        speed = ""
        if g["sold_days"] and avg_sold_days:
            group_avg_days = sum(g["sold_days"]) / len(g["sold_days"])
            if group_avg_days < avg_sold_days:
                speed = f" y se venden en {group_avg_days:.0f} días promedio (vs {avg_sold_days:.0f} del resto)"
        detail = (
            f"Los {brand} {model} {year_min}–{year_max} entre {price_min:,.0f} y {price_max:,.0f} "
            f"reciben {abs(over_avg)}% {'más' if over_avg >= 0 else 'menos'} consultas que el promedio{speed}."
        )
        stock_note = (
            f"Quedan {g['in_stock']} en stock." if g["in_stock"] else "No queda stock disponible de este modelo."
        )
        recommendations.append(
            {
                "title": f"Oportunidad de stock: {brand} {model}",
                "detail": detail,
                "reason": f"{g['inquiries']} consultas históricas · {g['sold']} ventas. {stock_note}",
                "metric": f"+{over_avg}% consultas" if over_avg > 0 else f"{g['inquiries']} consultas",
            }
        )
    return recommendations[:3]


def price_vs_interest(db: Session, organization_id: str, currency: str = "USD") -> dict:
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.organization_id == organization_id, Vehicle.deleted_at.is_(None))
    ).all()
    inquiries = inquiries_map(db, organization_id)
    won = _won_counts(db, organization_id)

    points = []
    best = None
    for label, low, high in _price_bands(currency):
        in_band = [v for v in vehicles if low <= v.price < high]
        if not in_band:
            points.append(
                {
                    "range_label": label, "min_price": low, "max_price": high,
                    "vehicles": 0, "inquiries": 0, "avg_days_in_stock": None, "sales": 0,
                }
            )
            continue
        band_inquiries = sum(inquiries.get(v.id, 0) for v in in_band)
        point = {
            "range_label": label,
            "min_price": low,
            "max_price": high,
            "vehicles": len(in_band),
            "inquiries": band_inquiries,
            "avg_days_in_stock": round(sum(v.days_in_stock for v in in_band) / len(in_band), 1),
            "sales": sum(won.get(v.id, 0) for v in in_band),
        }
        points.append(point)
        if best is None or band_inquiries > best["inquiries"]:
            best = point

    insight = None
    if best and best["inquiries"]:
        insight = (
            f"Los vehículos publicados en el rango {best['range_label']} generan la mayor cantidad "
            f"de consultas ({best['inquiries']}) con un promedio de {best['avg_days_in_stock']:.0f} días en stock."
        )
    return {"points": points, "insight": insight}
