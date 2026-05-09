import strawberry
from typing import List
from schema.types import Order, OrderStatus, OrderType

orders: List[Order] = [
    Order(
        id=strawberry.ID("1"),
        customer_name="John Smith",
        product="Chicken Biryani",
        quantity=1,
        price=14.99,
        status=OrderStatus.PENDING,
        type=OrderType.NEW,
        created_at="2025-12-22T10:30:00Z",
    )
]
