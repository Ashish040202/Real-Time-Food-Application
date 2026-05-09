import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean
from database import Base


class OrderModel(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
