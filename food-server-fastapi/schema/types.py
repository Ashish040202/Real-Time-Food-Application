import strawberry
from enum import Enum
from typing import Optional, List


@strawberry.enum
class UserRole(Enum):
    USER = "USER"
    ADMIN = "ADMIN"


@strawberry.enum
class OrderStatus(Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    ACCEPTED = "ACCEPTED"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"


@strawberry.enum
class OrderType(Enum):
    SELL = "SELL"
    NEW = "NEW"


@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str
    role: UserRole


@strawberry.type
class AuthPayload:
    token: str
    user: User


@strawberry.type
class Order:
    id: strawberry.ID
    user_id: Optional[strawberry.ID]
    customer_name: str
    product: str
    quantity: int
    price: float
    status: OrderStatus
    type: OrderType
    created_at: str


@strawberry.type
class MenuItem:
    id: strawberry.ID
    name: str
    description: str
    rate: float
    category: str
    available: bool


@strawberry.input
class RegisterInput:
    name: str
    email: str
    password: str
    role: UserRole = UserRole.USER


@strawberry.input
class LoginInput:
    email: str
    password: str


@strawberry.input
class CreateOrderInput:
    product: str
    quantity: int
    price: float
    type: OrderType


@strawberry.enum
class OrderEventType(Enum):
    ORDER_PLACED = "ORDER_PLACED"
    STATUS_CHANGED = "STATUS_CHANGED"


@strawberry.type
class OrderEvent:
    id: strawberry.ID
    order_id: strawberry.ID
    event_type: OrderEventType
    old_status: Optional[OrderStatus]
    new_status: OrderStatus
    triggered_by_name: Optional[str]
    triggered_by_role: Optional[str]
    timestamp: str


@strawberry.type
class OrderHistory:
    order: Order
    events: List[OrderEvent]
