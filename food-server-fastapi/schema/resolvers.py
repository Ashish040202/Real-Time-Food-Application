import json
import uuid
import strawberry
from datetime import datetime, timezone
from typing import AsyncGenerator, List, Optional
from strawberry.types import Info
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .types import Order, MenuItem, OrderStatus, OrderType, CreateOrderInput
from models import OrderModel, MenuItemModel
import redis_client


def model_to_order(m: OrderModel) -> Order:
    return Order(
        id=strawberry.ID(m.id),
        customer_name=m.customer_name,
        product=m.product,
        quantity=m.quantity,
        price=m.price,
        status=OrderStatus(m.status),
        type=OrderType(m.type),
        created_at=m.created_at,
    )


def model_to_menu_item(m: MenuItemModel) -> MenuItem:
    return MenuItem(
        id=strawberry.ID(m.id),
        name=m.name,
        description=m.description,
        rate=m.rate,
        category=m.category,
        available=m.available,
    )


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
    async def orders(self, info: Info) -> List[Order]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(select(OrderModel))
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_status(self, info: Info, status: OrderStatus) -> List[Order]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(OrderModel).where(OrderModel.status == status.value)
        )
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_type(self, info: Info, type: OrderType) -> List[Order]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(OrderModel).where(OrderModel.type == type.value)
        )
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_order_id(self, info: Info, order_id: strawberry.ID) -> Optional[Order]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(OrderModel).where(OrderModel.id == str(order_id))
        )
        m = result.scalar_one_or_none()
        return model_to_order(m) if m else None

    @strawberry.field
    async def list_order_items(self, info: Info) -> List[MenuItem]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(select(MenuItemModel))
        return [model_to_menu_item(m) for m in result.scalars().all()]


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_order(self, info: Info, input: CreateOrderInput) -> Order:
        db: AsyncSession = info.context["db"]
        new_model = OrderModel(
            id=str(uuid.uuid4()),
            customer_name=input.customer_name,
            product=input.product,
            quantity=input.quantity,
            price=input.price,
            status=OrderStatus.PENDING.value,
            type=input.type.value,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(new_model)
        await db.commit()
        await db.refresh(new_model)
        order = model_to_order(new_model)
        await redis_client.publish("ORDER_CREATED", order_to_dict(order))
        return order

    @strawberry.mutation
    async def update_order_status(self, info: Info, id: strawberry.ID, status: OrderStatus) -> Order:
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(OrderModel).where(OrderModel.id == str(id))
        )
        order_model = result.scalar_one_or_none()
        if not order_model:
            raise ValueError("Order not found")
        order_model.status = status.value
        await db.commit()
        await db.refresh(order_model)
        order = model_to_order(order_model)
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
