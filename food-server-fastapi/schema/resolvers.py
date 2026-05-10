import json
import uuid
import strawberry
from datetime import datetime, timezone
from typing import AsyncGenerator, List, Optional
from strawberry.types import Info
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .types import (
    Order, MenuItem, User, AuthPayload,
    OrderStatus, OrderType, UserRole,
    CreateOrderInput, RegisterInput, LoginInput,
    OrderEvent, OrderHistory, OrderEventType,
    Notification, NotificationType,
)
from models import OrderModel, MenuItemModel, UserModel, OrderEventModel, NotificationModel
from auth import hash_password, verify_password, create_access_token
import redis_client


# ---------- helpers ----------

async def require_auth(info: Info) -> UserModel:
    user = await info.context.load_user()
    if not user:
        raise ValueError("Authentication required")
    return user


async def require_admin(info: Info) -> UserModel:
    user = await require_auth(info)
    if user.role != UserRole.ADMIN.value:
        raise ValueError("Admin access required")
    return user


def model_to_user(m: UserModel) -> User:
    return User(
        id=strawberry.ID(m.id),
        name=m.name,
        email=m.email,
        role=UserRole(m.role),
    )


def model_to_order(m: OrderModel) -> Order:
    return Order(
        id=strawberry.ID(m.id),
        user_id=strawberry.ID(m.user_id) if m.user_id else None,
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
        "user_id": str(order.user_id) if order.user_id else None,
        "customer_name": order.customer_name,
        "product": order.product,
        "quantity": order.quantity,
        "price": order.price,
        "status": order.status.value,
        "type": order.type.value,
        "created_at": order.created_at,
    }


def model_to_order_event(m: OrderEventModel) -> OrderEvent:
    return OrderEvent(
        id=strawberry.ID(m.id),
        order_id=strawberry.ID(m.order_id),
        event_type=OrderEventType(m.event_type),
        old_status=OrderStatus(m.old_status) if m.old_status else None,
        new_status=OrderStatus(m.new_status),
        triggered_by_name=m.triggered_by_name,
        triggered_by_role=m.triggered_by_role,
        timestamp=m.timestamp,
    )


def model_to_notification(m: NotificationModel) -> Notification:
    return Notification(
        id=strawberry.ID(m.id),
        type=NotificationType(m.type),
        title=m.title,
        message=m.message,
        order_id=strawberry.ID(m.order_id) if m.order_id else None,
        read=m.read,
        created_at=m.created_at,
    )


async def record_event(
    db: AsyncSession,
    order_id: str,
    event_type: OrderEventType,
    new_status: OrderStatus,
    old_status: Optional[OrderStatus],
    user: Optional[UserModel],
) -> None:
    event = OrderEventModel(
        id=str(uuid.uuid4()),
        order_id=order_id,
        event_type=event_type.value,
        old_status=old_status.value if old_status else None,
        new_status=new_status.value,
        triggered_by_id=user.id if user else None,
        triggered_by_name=user.name if user else None,
        triggered_by_role=user.role if user else None,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    db.add(event)


def dict_to_order(data: dict) -> Order:
    return Order(
        id=strawberry.ID(data["id"]),
        user_id=strawberry.ID(data["user_id"]) if data.get("user_id") else None,
        customer_name=data["customer_name"],
        product=data["product"],
        quantity=int(data["quantity"]),
        price=float(data["price"]),
        status=OrderStatus(data["status"]),
        type=OrderType(data["type"]),
        created_at=data["created_at"],
    )


# ---------- Query ----------

@strawberry.type
class Query:
    @strawberry.field
    async def me(self, info: Info) -> User:
        return model_to_user(await require_auth(info))

    @strawberry.field
    async def orders(self, info: Info) -> List[Order]:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        if user.role == UserRole.ADMIN.value:
            result = await db.execute(select(OrderModel))
        else:
            result = await db.execute(
                select(OrderModel).where(OrderModel.user_id == user.id)
            )
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_status(self, info: Info, status: OrderStatus) -> List[Order]:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        stmt = select(OrderModel).where(OrderModel.status == status.value)
        if user.role != UserRole.ADMIN.value:
            stmt = stmt.where(OrderModel.user_id == user.id)
        result = await db.execute(stmt)
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_type(self, info: Info, type: OrderType) -> List[Order]:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        stmt = select(OrderModel).where(OrderModel.type == type.value)
        if user.role != UserRole.ADMIN.value:
            stmt = stmt.where(OrderModel.user_id == user.id)
        result = await db.execute(stmt)
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def orders_by_order_id(self, info: Info, order_id: strawberry.ID) -> Optional[Order]:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        result = await db.execute(
            select(OrderModel).where(OrderModel.id == str(order_id))
        )
        m = result.scalar_one_or_none()
        if not m:
            return None
        if user.role != UserRole.ADMIN.value and m.user_id != user.id:
            raise ValueError("Access denied")
        return model_to_order(m)

    @strawberry.field
    async def list_order_items(self, info: Info) -> List[MenuItem]:
        db: AsyncSession = info.context["db"]
        result = await db.execute(select(MenuItemModel))
        return [model_to_menu_item(m) for m in result.scalars().all()]

    @strawberry.field
    async def order_history(self, info: Info, order_id: strawberry.ID) -> OrderHistory:
        await require_admin(info)
        db: AsyncSession = info.context["db"]
        order_result = await db.execute(
            select(OrderModel).where(OrderModel.id == str(order_id))
        )
        order_model = order_result.scalar_one_or_none()
        if not order_model:
            raise ValueError("Order not found")
        events_result = await db.execute(
            select(OrderEventModel)
            .where(OrderEventModel.order_id == str(order_id))
            .order_by(OrderEventModel.timestamp)
        )
        events = events_result.scalars().all()
        return OrderHistory(
            order=model_to_order(order_model),
            events=[model_to_order_event(e) for e in events],
        )

    @strawberry.field
    async def all_orders_with_events(self, info: Info) -> List[Order]:
        """Admin-only: returns all orders (used to populate the history browser)."""
        await require_admin(info)
        db: AsyncSession = info.context["db"]
        result = await db.execute(select(OrderModel).order_by(OrderModel.created_at.desc()))
        return [model_to_order(o) for o in result.scalars().all()]

    @strawberry.field
    async def my_notifications(self, info: Info) -> List[Notification]:
        user = await require_auth(info)
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(NotificationModel)
            .where(NotificationModel.recipient_id == user.id)
            .order_by(NotificationModel.created_at.desc())
            .limit(50)
        )
        return [model_to_notification(n) for n in result.scalars().all()]


# ---------- Mutation ----------

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def register(self, info: Info, input: RegisterInput) -> AuthPayload:
        db: AsyncSession = info.context["db"]
        existing = await db.execute(
            select(UserModel).where(UserModel.email == input.email)
        )
        if existing.scalar_one_or_none():
            raise ValueError("Email already registered")
        user = UserModel(
            id=str(uuid.uuid4()),
            name=input.name,
            email=input.email,
            password_hash=hash_password(input.password),
            role=input.role.value,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return AuthPayload(token=create_access_token(user.id), user=model_to_user(user))

    @strawberry.mutation
    async def login(self, info: Info, input: LoginInput) -> AuthPayload:
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(UserModel).where(UserModel.email == input.email)
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(input.password, user.password_hash):
            raise ValueError("Invalid email or password")
        return AuthPayload(token=create_access_token(user.id), user=model_to_user(user))

    @strawberry.mutation
    async def create_order(self, info: Info, input: CreateOrderInput) -> Order:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        new_model = OrderModel(
            id=str(uuid.uuid4()),
            user_id=user.id,
            customer_name=user.name,
            product=input.product,
            quantity=input.quantity,
            price=input.price,
            status=OrderStatus.PENDING.value,
            type=input.type.value,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(new_model)
        await db.flush()  # write order to DB within transaction so FK exists for the event
        await record_event(
            db, new_model.id,
            OrderEventType.ORDER_PLACED,
            OrderStatus.PENDING,
            old_status=None,
            user=user,
        )
        await db.commit()
        await db.refresh(new_model)
        order = model_to_order(new_model)
        await redis_client.publish("ORDER_CREATED", order_to_dict(order))
        return order

    @strawberry.mutation
    async def mark_notification_read(self, info: Info, id: strawberry.ID) -> bool:
        user = await require_auth(info)
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(NotificationModel).where(
                NotificationModel.id == str(id),
                NotificationModel.recipient_id == user.id,
            )
        )
        notif = result.scalar_one_or_none()
        if notif:
            notif.read = True
            await db.commit()
        return True

    @strawberry.mutation
    async def mark_all_notifications_read(self, info: Info) -> bool:
        user = await require_auth(info)
        db: AsyncSession = info.context["db"]
        result = await db.execute(
            select(NotificationModel).where(
                NotificationModel.recipient_id == user.id,
                NotificationModel.read == False,  # noqa: E712
            )
        )
        for notif in result.scalars().all():
            notif.read = True
        await db.commit()
        return True

    @strawberry.mutation
    async def update_order_status(self, info: Info, id: strawberry.ID, status: OrderStatus) -> Order:
        db: AsyncSession = info.context["db"]
        user = await require_auth(info)
        result = await db.execute(
            select(OrderModel).where(OrderModel.id == str(id))
        )
        order_model = result.scalar_one_or_none()
        if not order_model:
            raise ValueError("Order not found")
        if user.role != UserRole.ADMIN.value and order_model.user_id != user.id:
            raise ValueError("Access denied")
        old_status = OrderStatus(order_model.status)
        order_model.status = status.value
        await record_event(
            db, order_model.id,
            OrderEventType.STATUS_CHANGED,
            status,
            old_status=old_status,
            user=user,
        )
        await db.commit()
        await db.refresh(order_model)
        order = model_to_order(order_model)
        publish_data = order_to_dict(order)
        publish_data["triggered_by_role"] = user.role   # needed by notification subscriber
        await redis_client.publish("ORDER_STATUS_UPDATED", publish_data)
        return order


# ---------- Subscription ----------

@strawberry.type
class Subscription:
    @strawberry.subscription
    async def order_created(self, info: Info) -> AsyncGenerator[Order, None]:
        user = await require_auth(info)
        r, pubsub = await redis_client.create_pubsub()
        await pubsub.subscribe("ORDER_CREATED")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    order = dict_to_order(json.loads(message["data"]))
                    if user.role != UserRole.ADMIN.value and str(order.user_id) != user.id:
                        continue
                    yield order
        finally:
            await pubsub.unsubscribe("ORDER_CREATED")
            await r.close()

    @strawberry.subscription
    async def notification_received(self, info: Info) -> AsyncGenerator[Notification, None]:
        user = await require_auth(info)
        r, pubsub = await redis_client.create_pubsub()
        channel = f"NOTIFICATION:{user.id}"
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    yield Notification(
                        id=strawberry.ID(data["id"]),
                        type=NotificationType(data["type"]),
                        title=data["title"],
                        message=data["message"],
                        order_id=strawberry.ID(data["order_id"]) if data.get("order_id") else None,
                        read=data["read"],
                        created_at=data["created_at"],
                    )
        finally:
            await pubsub.unsubscribe(channel)
            await r.close()

    @strawberry.subscription
    async def order_status_updated(
        self, info: Info, order_id: Optional[strawberry.ID] = None
    ) -> AsyncGenerator[Order, None]:
        user = await require_auth(info)
        r, pubsub = await redis_client.create_pubsub()
        await pubsub.subscribe("ORDER_STATUS_UPDATED")
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    order = dict_to_order(json.loads(message["data"]))
                    if user.role != UserRole.ADMIN.value and str(order.user_id) != user.id:
                        continue
                    if order_id and str(order.id) != str(order_id):
                        continue
                    yield order
        finally:
            await pubsub.unsubscribe("ORDER_STATUS_UPDATED")
            await r.close()
