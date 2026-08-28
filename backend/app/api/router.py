from fastapi import APIRouter

from app.api.routers import (
    activity,
    analytics,
    auth,
    commerce,
    conversations,
    customers,
    intelligence,
    opportunities,
    organization,
    system,
    users,
    vehicles,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(organization.router)
api_router.include_router(organization.stages_router)
api_router.include_router(organization.flags_router)
api_router.include_router(customers.router)
api_router.include_router(vehicles.router)
api_router.include_router(conversations.router)
api_router.include_router(opportunities.router)
api_router.include_router(activity.router)
api_router.include_router(commerce.router)
api_router.include_router(analytics.router)
api_router.include_router(intelligence.router)
api_router.include_router(system.router)
