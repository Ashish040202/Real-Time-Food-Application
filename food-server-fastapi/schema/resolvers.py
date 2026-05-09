import json
import strawberry
from datetime import datetime
from typing import AsyncGenerator, List, Optional
from strawberry.types import Info

from .types import Order, MenuItem, OrderStatus, OrderType, CreateOrderInput
from data.orders_data import orders
from data.menu_data import menu_items
import redis_client


def order_to_dict(order: Order) -> dict:
    return {
        "id": str(order.id),
        "customer_name": order.customer_name,
        "product": order.product,
        "quantity": order.quantity,
        "price": order.price,
        "status": order.status.value,
        "type": order.type.value,
        "created_at": order.created_at,
    }


def dict_to_order(data: dict) -> Order:
    return Order(
        id=strawberry.ID(data["id"]),
        customer_name=data["customer_name"],
        product=data["product"],
        quantity=int(data["quantity"]),
        price=float(data["price"]),
        status=OrderStatus(data["status"]),
        type=OrderType(data["type"]),
        created_at=data["created_at"],
    )


@strawberry.type
class Query:
    @strawberry.field
    def orders(self) -> List[Order]:
        return orders

    @strawberry.field
    def orders_by_status(self, status: OrderStatus) -> List[Order]:
        return [o for o in orders if o.status == status]

    @strawberry.field
    def orders_by_type(self, type: OrderType) -> List[Order]:
        return [o for o in orders if o.type == type]

    @strawberry.field
    def orders_by_order_id(self, order_id: strawberry.ID) -> Optional[Order]:
        return next((o for o in orders if o.id == order_id), None)

    @strawberry.field
    def list_order_items(self) -> List[MenuItem]:
        return menu_items


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_order(self, input: CreateOrderInput) -> Order:
        new_order = Order(
            id=strawberry.ID(str(len(orders) + 1)),
            customer_name=input.customer_name,
            product=input.product,
            quantity=input.quantity,
            price=input.price,
            status=OrderStatus.PENDING,
            type=input.type,
            created_at=datetime.utcnow().isoformat() + "Z",
        )
        orders.append(new_order)
        await redis_client.publish("ORDER_CREATED", order_to_dict(new_order))
        return new_order

    @strawberry.mutation
    async def update_order_status(self, id: strawberry.ID, status: OrderStatus) -> Order:
        order = next((o for o in orders if o.id == id), None)
        if not order:
            raise ValueError("Order not found")
        order.status = status
        await redis_client.publish("ORDER_STATUS_UPDATED", order_to_dict(order))
        return order


@strawberry.type
class Subscription:
    @strawberry.subscription
    async def order_created(self, info: Info) -> AsyncGenerator[Order, None]:
        r, pubsub = await redis_client.create_pubsub()
        await pubsub.subscribe("ORDER_CREATED")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield dict_to_order(json.loads(message["data"]))
        finally:
            await pubsub.unsubscribe("ORDER_CREATED")
            await r.aclose()

    @strawberry.subscription
    async def order_status_updated(
        self, info: Info, order_id: Optional[strawberry.ID] = None
    ) -> AsyncGenerator[Order, None]:
        r, pubsub = await redis_client.create_pubsub()
        await pubsub.subscribe("ORDER_STATUS_UPDATED")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    order = dict_to_order(json.loads(message["data"]))
                    if order_id and str(order.id) != str(order_id):
                        continue
                    yield order
        finally:
            await pubsub.unsubscribe("ORDER_STATUS_UPDATED")
            await r.aclose()
