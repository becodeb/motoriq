from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, AdminUser, CurrentOrg, CurrentUser, ManagerUser
from app.core.constants import AI_PROVIDERS
from app.core.errors import ApiError, not_found
from app.core.utils import normalize
from app.models import FeatureFlag, Opportunity, PipelineStage
from app.schemas.common import StageOut
from app.schemas.org import (
    AIConfigUpdate,
    FeatureFlagOut,
    OrganizationOut,
    OrganizationUpdate,
    StageCreate,
    StageReorder,
    StageUpdate,
)
from app.services import audit

router = APIRouter(prefix="/organization", tags=["organization"])


def _org_out(org) -> OrganizationOut:
    out = OrganizationOut.model_validate(org)
    out.ai_api_key_set = bool(org.ai_api_key)
    out.ai_api_key_hint = f"····{org.ai_api_key[-4:]}" if org.ai_api_key else None
    return out


@router.get("", response_model=OrganizationOut)
def get_organization(org: CurrentOrg, user: CurrentUser):
    return _org_out(org)


@router.patch("", response_model=OrganizationOut)
def update_organization(data: OrganizationUpdate, db: DB, org: CurrentOrg, admin: AdminUser):
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)
    audit.log(db, org.id, "organizacion_editada", "organization", org.id, admin.id, {"cambios": list(updates.keys())})
    db.commit()
    db.refresh(org)
    return _org_out(org)


@router.patch("/ai", response_model=OrganizationOut)
def update_ai_config(data: AIConfigUpdate, db: DB, org: CurrentOrg, admin: AdminUser):
    updates = data.model_dump(exclude_unset=True)
    if "ai_provider" in updates and updates["ai_provider"] and updates["ai_provider"] not in AI_PROVIDERS:
        raise ApiError("INVALID_PROVIDER", f"Proveedor inválido: {updates['ai_provider']}", 400)
    for field, value in updates.items():
        setattr(org, field, value)
    audit.log(
        db, org.id, "configuracion_ia", "organization", org.id, admin.id,
        {"cambios": [k for k in updates if k != "ai_api_key"] + (["ai_api_key"] if "ai_api_key" in updates else [])},
    )
    db.commit()
    db.refresh(org)
    return _org_out(org)


# ---------- Etapas del pipeline ----------

stages_router = APIRouter(prefix="/pipeline-stages", tags=["pipeline"])


@stages_router.get("", response_model=list[StageOut])
def list_stages(db: DB, org: CurrentOrg, user: CurrentUser):
    return db.scalars(
        select(PipelineStage)
        .where(PipelineStage.organization_id == org.id, PipelineStage.is_active.is_(True))
        .order_by(PipelineStage.position)
    ).all()


@stages_router.post("", response_model=StageOut, status_code=201)
def create_stage(data: StageCreate, db: DB, org: CurrentOrg, manager: ManagerUser):
    key = normalize(data.name).replace(" ", "_")[:40] or "etapa"
    existing_keys = set(
        db.scalars(select(PipelineStage.key).where(PipelineStage.organization_id == org.id)).all()
    )
    base_key, i = key, 2
    while key in existing_keys:
        key = f"{base_key}_{i}"
        i += 1
    # Insertar antes de las etapas de cierre (vendido/perdido).
    closing_positions = db.scalars(
        select(PipelineStage.position).where(
            PipelineStage.organization_id == org.id,
            (PipelineStage.is_won.is_(True)) | (PipelineStage.is_lost.is_(True)),
        )
    ).all()
    position = min(closing_positions) if closing_positions else (
        (db.scalar(select(func.max(PipelineStage.position)).where(PipelineStage.organization_id == org.id)) or 0) + 1
    )
    for stage in db.scalars(
        select(PipelineStage).where(PipelineStage.organization_id == org.id, PipelineStage.position >= position)
    ).all():
        stage.position += 1
    stage = PipelineStage(
        organization_id=org.id,
        key=key,
        name=data.name,
        color=data.color,
        probability=data.probability,
        position=position,
    )
    db.add(stage)
    audit.log(db, org.id, "etapa_creada", "pipeline_stage", stage.id, manager.id, {"nombre": data.name})
    db.commit()
    db.refresh(stage)
    return stage


@stages_router.patch("/{stage_id}", response_model=StageOut)
def update_stage(stage_id: str, data: StageUpdate, db: DB, org: CurrentOrg, manager: ManagerUser):
    stage = db.get(PipelineStage, stage_id)
    if not stage or stage.organization_id != org.id:
        raise not_found("etapa", "STAGE_NOT_FOUND")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("is_active") is False:
        if stage.is_won or stage.is_lost:
            raise ApiError("STAGE_PROTECTED", "Las etapas de cierre no se pueden desactivar", 400)
        in_use = db.scalar(
            select(func.count(Opportunity.id)).where(
                Opportunity.stage_id == stage.id, Opportunity.status == "abierta"
            )
        )
        if in_use:
            raise ApiError("STAGE_IN_USE", f"Hay {in_use} oportunidades abiertas en esta etapa", 409)
    for field, value in updates.items():
        setattr(stage, field, value)
    audit.log(db, org.id, "etapa_editada", "pipeline_stage", stage.id, manager.id)
    db.commit()
    db.refresh(stage)
    return stage


@stages_router.post("/reorder", response_model=list[StageOut])
def reorder_stages(data: StageReorder, db: DB, org: CurrentOrg, manager: ManagerUser):
    stages = {
        s.id: s
        for s in db.scalars(select(PipelineStage).where(PipelineStage.organization_id == org.id)).all()
    }
    position = 0
    for stage_id in data.stage_ids:
        if stage_id in stages:
            stages[stage_id].position = position
            position += 1
    for stage in sorted(stages.values(), key=lambda s: s.position):
        if stage.id not in data.stage_ids:
            stage.position = position
            position += 1
    db.commit()
    return db.scalars(
        select(PipelineStage)
        .where(PipelineStage.organization_id == org.id, PipelineStage.is_active.is_(True))
        .order_by(PipelineStage.position)
    ).all()


# ---------- Feature flags ----------

flags_router = APIRouter(prefix="/feature-flags", tags=["feature-flags"])


@flags_router.get("", response_model=list[FeatureFlagOut])
def list_flags(db: DB, org: CurrentOrg, user: CurrentUser):
    return db.scalars(select(FeatureFlag).where(FeatureFlag.organization_id == org.id)).all()


@flags_router.patch("/{key}", response_model=FeatureFlagOut)
def toggle_flag(key: str, db: DB, org: CurrentOrg, admin: AdminUser):
    flag = db.scalar(
        select(FeatureFlag).where(FeatureFlag.organization_id == org.id, FeatureFlag.key == key)
    )
    if not flag:
        flag = FeatureFlag(organization_id=org.id, key=key, enabled=True)
        db.add(flag)
    else:
        flag.enabled = not flag.enabled
    audit.log(db, org.id, "feature_flag", "feature_flag", flag.id, admin.id, {"key": key, "enabled": flag.enabled})
    db.commit()
    db.refresh(flag)
    return flag
