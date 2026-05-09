import strawberry
from enum import Enum
from typing import Optional


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
class Order:
    id: strawberry.ID
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
class CreateOrderInput:
    customer_name: str
    product: str
    quantity: int
    price: float
    type: OrderType
