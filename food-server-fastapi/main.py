import strawberry
from contextlib import asynccontextmanager
from strawberry.fastapi import GraphQLRouter
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL, GRAPHQL_WS_PROTOCOL
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from schema.resolvers import Query, Mutation, Subscription
from database import get_db, init_db, AsyncSessionLocal
from models import MenuItemModel


async def seed_menu_items(db: AsyncSession):
    result = await db.execute(select(MenuItemModel))
    if result.scalars().first():
        return

    items = [
        MenuItemModel(id="1", name="Chicken Biryani", description="Aromatic basmati rice cooked with tender chicken and traditional spices", rate=14.99, category="Main Course", available=True),
        MenuItemModel(id="2", name="Butter Chicken with Naan", description="Creamy tomato-based curry with succulent chicken pieces, served with fresh naan bread", rate=16.99, category="Main Course", available=True),
        MenuItemModel(id="3", name="Vegetable Samosas (6 pcs)", description="Crispy pastry filled with spiced potatoes and peas", rate=8.99, category="Appetizer", available=True),
        MenuItemModel(id="4", name="Masala Chai Tea", description="Traditional Indian spiced tea with milk", rate=3.99, category="Beverage", available=True),
        MenuItemModel(id="5", name="Tandoori Chicken", description="Marinated chicken cooked in a clay oven with traditional spices", rate=18.99, category="Main Course", available=True),
        MenuItemModel(id="6", name="Palak Paneer", description="Fresh cottage cheese cubes in a creamy spinach curry", rate=13.99, category="Main Course", available=True),
        MenuItemModel(id="7", name="Gulab Jamun (4 pcs)", description="Sweet milk dumplings soaked in rose-flavored syrup", rate=6.99, category="Dessert", available=True),
        MenuItemModel(id="8", name="Mango Lassi", description="Refreshing yogurt-based drink with sweet mango", rate=4.99, category="Beverage", available=True),
        MenuItemModel(id="9", name="Chicken Tikka Masala", description="Grilled chicken chunks in a creamy tomato-based sauce", rate=15.99, category="Main Course", available=True),
        MenuItemModel(id="10", name="Garlic Naan", description="Fresh flatbread topped with garlic and butter", rate=3.49, category="Bread", available=True),
    ]
    db.add_all(items)
    await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_menu_items(db)
    yield


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription,
)


async def get_context(db: AsyncSession = Depends(get_db)):
    return {"db": db}


graphql_app = GraphQLRouter(
    schema,
    context_getter=get_context,
    subscription_protocols=[
        GRAPHQL_TRANSPORT_WS_PROTOCOL,
        GRAPHQL_WS_PROTOCOL,
    ],
)

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphql_app, prefix="/graphql")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=4000, reload=True)
