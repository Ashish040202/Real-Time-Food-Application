import asyncio
import strawberry
from contextlib import asynccontextmanager
from strawberry.fastapi import GraphQLRouter, BaseContext
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL, GRAPHQL_WS_PROTOCOL
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from schema.resolvers import Query, Mutation, Subscription
from database import get_db, init_db, AsyncSessionLocal
from models import MenuItemModel, UserModel
from auth import decode_token


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

    from notification_worker import run_subscriber, run_worker
    subscriber_task = asyncio.create_task(run_subscriber())
    worker_task = asyncio.create_task(run_worker())

    yield

    subscriber_task.cancel()
    worker_task.cancel()
    for task in (subscriber_task, worker_task):
        try:
            await task
        except asyncio.CancelledError:
            pass


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription,
)


class AppContext(BaseContext):
    def __init__(self, db: AsyncSession):
        super().__init__()
        self.db = db
        self.current_user = None
        self._user_loaded = False
        self._load_lock = asyncio.Lock()

    async def load_user(self):
        # Fast path: already loaded (no lock needed after first load)
        if self._user_loaded:
            return self.current_user
        # Slow path: acquire lock so concurrent subscription starts don't
        # race past each other before the DB query completes.
        async with self._load_lock:
            if self._user_loaded:  # re-check inside lock
                return self.current_user
            token = None
            req = getattr(self, 'request', None)
            ws = getattr(self, 'websocket', None)
            conn = req or ws
            if conn:
                auth_header = conn.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                else:
                    token = conn.query_params.get("token")
            # Check connectionParams (sent by graphql-ws client via connectionParams)
            if not token:
                cp = getattr(self, 'connection_params', None) or {}
                header = cp.get("Authorization", "")
                if header.startswith("Bearer "):
                    token = header[7:]
            if token:
                user_id = decode_token(token)
                if user_id:
                    result = await self.db.execute(
                        select(UserModel).where(UserModel.id == user_id)
                    )
                    self.current_user = result.scalar_one_or_none()
            self._user_loaded = True
            return self.current_user

    def get(self, key, default=None):
        if key == "db":
            return self.db
        if key == "current_user":
            return self.current_user
        return default

    def __getitem__(self, key):
        if key == "db":
            return self.db
        if key == "current_user":
            return self.current_user
        raise KeyError(key)


async def get_context(db: AsyncSession = Depends(get_db)) -> AppContext:
    return AppContext(db=db)


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
