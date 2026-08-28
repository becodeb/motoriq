from app.models.activity import Appointment, Followup, Task
from app.models.commerce import FinancingScenario, Quote, TradeIn
from app.models.conversation import Conversation, Message
from app.models.customer import Customer, CustomerNote, Tag, customer_tags
from app.models.intelligence import (
    AIInsight,
    AIUsage,
    CustomerVehicleMatch,
    LeadScoreHistory,
)
from app.models.opportunity import Opportunity, OpportunityStageHistory
from app.models.org import FeatureFlag, Organization, PipelineStage
from app.models.system import AuditLog, Automation, AutomationRun, Notification, Segment
from app.models.user import User
from app.models.vehicle import Vehicle, VehicleImage, VehicleStatusHistory

__all__ = [
    "AIInsight",
    "AIUsage",
    "Appointment",
    "AuditLog",
    "Automation",
    "AutomationRun",
    "Conversation",
    "Customer",
    "CustomerNote",
    "CustomerVehicleMatch",
    "FeatureFlag",
    "FinancingScenario",
    "Followup",
    "LeadScoreHistory",
    "Message",
    "Notification",
    "Opportunity",
    "OpportunityStageHistory",
    "Organization",
    "PipelineStage",
    "Quote",
    "Segment",
    "Tag",
    "Task",
    "TradeIn",
    "User",
    "Vehicle",
    "VehicleImage",
    "VehicleStatusHistory",
    "customer_tags",
]
