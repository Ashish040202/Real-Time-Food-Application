import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey
from database import Base


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="USER")


class OrderModel(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    customer_name = Column(String, nullable=False)
    product = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="PENDING")
    type = Column(String, nullable=False)
    created_at = Column(String, nullable=False)


class MenuItemModel(Base):
    __tablename__ = "menu_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    rate = Column(Float, nullable=False)
    category = Column(String, nullable=True)
    available = Column(Boolean, nullable=False, default=True)


class NotificationModel(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_id = Column(String, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)        # NEW_ORDER | ORDER_CANCELLED | ORDER_COMPLETED
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    order_id = Column(String, nullable=True)     # informational only, no FK
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(String, nullable=False)


class OrderEventModel(Base):
    __tablename__ = "order_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    event_type = Column(String, nullable=False)       # ORDER_PLACED | STATUS_CHANGED
    old_status = Column(String, nullable=True)         # null for the first event
    new_status = Column(String, nullable=False)
    triggered_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    triggered_by_name = Column(String, nullable=True)
    triggered_by_role = Column(String, nullable=True)  # USER | ADMIN
    timestamp = Column(String, nullable=False)
