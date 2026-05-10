# Real-Time Food Application — System Documentation

This document explains the complete architecture, data flow, and code-level implementation of the Real-Time Food Application. It covers both the FastAPI/GraphQL backend and the Next.js frontend, and explains how every major feature works from end to end.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Backend — Deep Dive](#3-backend--deep-dive)
   - 3.1 [Project Structure](#31-project-structure)
   - 3.2 [Database Layer](#32-database-layer)
   - 3.3 [Models](#33-models)
   - 3.4 [Authentication](#34-authentication)
   - 3.5 [GraphQL Schema — Types](#35-graphql-schema--types)
   - 3.6 [GraphQL Schema — Resolvers](#36-graphql-schema--resolvers)
   - 3.7 [Real-Time Subscriptions with Redis](#37-real-time-subscriptions-with-redis)
   - 3.8 [Request Context — How Auth Flows into Every Resolver](#38-request-context--how-auth-flows-into-every-resolver)
   - 3.9 [Application Entry Point](#39-application-entry-point)
4. [Frontend — Deep Dive](#4-frontend--deep-dive)
   - 4.1 [Project Structure](#41-project-structure)
   - 4.2 [Apollo Client Setup](#42-apollo-client-setup)
   - 4.3 [Authentication Context](#43-authentication-context)
   - 4.4 [Route Protection with AuthGuard](#44-route-protection-with-authguard)
   - 4.5 [Pages and Their Responsibilities](#45-pages-and-their-responsibilities)
   - 4.6 [Real-Time Updates on the Frontend](#46-real-time-updates-on-the-frontend)
   - 4.7 [Role-Based UI](#47-role-based-ui)
5. [End-to-End Feature Walkthroughs](#5-end-to-end-feature-walkthroughs)
   - 5.1 [User Registration and Login](#51-user-registration-and-login)
   - 5.2 [Placing an Order](#52-placing-an-order)
   - 5.3 [Admin Updates Order Status — User Sees It Live](#53-admin-updates-order-status--user-sees-it-live)
   - 5.4 [Cancelling an Order](#54-cancelling-an-order)
6. [Data Flow Diagram](#6-data-flow-diagram)

---

## 1. System Overview

This is a full-stack real-time food ordering platform. Users can browse a menu, place orders, and watch their order status update live without ever refreshing the page. Admins see all incoming orders in a live feed and can change their statuses, which instantly reflects on the ordering user's screen.

The core technologies driving real-time behaviour are:

- **GraphQL Subscriptions** over WebSocket — the transport layer between browser and server.
- **Redis Pub/Sub** — the message broker inside the server that connects a mutation (status change) to all active subscribers listening for that event.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | FastAPI | HTTP server, dependency injection, WebSocket support |
| GraphQL library | Strawberry | Defines schema (types, queries, mutations, subscriptions) |
| Database | PostgreSQL | Persistent storage for users, orders, menu items |
| ORM | SQLAlchemy (async) | Talks to Postgres using Python async/await |
| DB driver | asyncpg | Low-level async Postgres driver used by SQLAlchemy |
| Message broker | Redis | Pub/Sub channel for broadcasting real-time events |
| Auth tokens | python-jose (JWT) | Signs and verifies access tokens |
| Password hashing | bcrypt | Hashes passwords before storing them |
| Frontend framework | Next.js 14 (App Router) | React-based UI with server/client components |
| GraphQL client | Apollo Client v4 | Runs queries, mutations, and subscriptions from the browser |
| WebSocket transport | graphql-ws | Implements the `graphql-transport-ws` protocol for subscriptions |
| Styling | Tailwind CSS | Utility-first CSS |

---

## 3. Backend — Deep Dive

### 3.1 Project Structure

```
food-server-fastapi/
├── main.py              # FastAPI app, context setup, middleware, lifespan
├── database.py          # SQLAlchemy engine, session factory, init_db
├── models.py            # ORM table definitions
├── auth.py              # JWT creation/verification, password hashing
├── redis_client.py      # Redis publish and pubsub helpers
├── schema/
│   ├── types.py         # Strawberry GraphQL type definitions
│   └── resolvers.py     # Query, Mutation, Subscription resolvers
├── requirements.txt
└── .env
```

---

### 3.2 Database Layer

**File: `database.py`**

```python
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

- `create_async_engine` creates a connection pool to PostgreSQL using the `asyncpg` driver.
- `async_sessionmaker` is a factory that produces `AsyncSession` objects. Each HTTP request or WebSocket message gets its own session.
- `expire_on_commit=False` means SQLAlchemy won't automatically expire loaded objects after a commit, which avoids lazy-load errors in async contexts.

```python
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

`get_db` is a FastAPI dependency. When injected into a function, it opens a session, hands it to the function, and closes it automatically when the function is done — even if an exception occurs.

```python
async def init_db():
    from models import OrderModel, MenuItemModel
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

`init_db` runs at startup. It imports all models (which registers them with `Base.metadata`) and then calls `create_all`, which issues `CREATE TABLE IF NOT EXISTS` for every model that doesn't already have a corresponding table.

---

### 3.3 Models

**File: `models.py`**

Three tables are defined using SQLAlchemy's declarative style.

**`UserModel`** — the `users` table:
```python
class UserModel(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name          = Column(String, nullable=False)
    email         = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role          = Column(String, nullable=False, default="USER")
```
- `id` is a UUID generated in Python (not the database), ensuring portability.
- `email` has a `unique` constraint to prevent duplicate accounts.
- `role` is stored as a plain string (`"USER"` or `"ADMIN"`).

**`OrderModel`** — the `orders` table:
```python
class OrderModel(Base):
    __tablename__ = "orders"
    id            = Column(String, primary_key=True, ...)
    user_id       = Column(String, ForeignKey("users.id"), nullable=True)
    customer_name = Column(String, nullable=False)
    product       = Column(String, nullable=False)
    quantity      = Column(Integer, nullable=False)
    price         = Column(Float, nullable=False)
    status        = Column(String, nullable=False, default="PENDING")
    type          = Column(String, nullable=False)
    created_at    = Column(String, nullable=False)
```
- `user_id` is a foreign key pointing to the `users` table. It is `nullable=True` to allow legacy or anonymous orders.
- `status` starts as `"PENDING"` and progresses through the order lifecycle.
- `type` distinguishes `"NEW"` (customer orders food) from `"SELL"` (sell-type orders).

**`MenuItemModel`** — the `menu_items` table:
```python
class MenuItemModel(Base):
    __tablename__ = "menu_items"
    id          = Column(String, primary_key=True, ...)
    name        = Column(String, nullable=False)
    description = Column(String)
    rate        = Column(Float, nullable=False)
    category    = Column(String)
    available   = Column(Boolean, nullable=False, default=True)
```
Menu items are seeded at application startup via `seed_menu_items()` in `main.py`. The seed function first checks if any rows exist and skips seeding if they do — ensuring it only runs once on a fresh database.

---

### 3.4 Authentication

**File: `auth.py`**

**Password Hashing:**
```python
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
```
- bcrypt has a hard limit of 72 bytes. The `[:72]` slice ensures we never silently truncate a longer password in a way that could allow two different passwords to hash to the same value.
- `bcrypt.gensalt()` generates a random salt every time, so two identical passwords will produce different hashes.

**JWT Tokens:**
```python
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload.get("sub")
    except JWTError:
        return None
```
- The token payload contains `sub` (the user's UUID) and `exp` (expiry timestamp).
- `decode_token` returns `None` on any error — expired token, invalid signature, malformed token — rather than raising an exception. This makes it safe to call defensively anywhere.

---

### 3.5 GraphQL Schema — Types

**File: `schema/types.py`**

Strawberry uses Python classes decorated with `@strawberry.type`, `@strawberry.input`, and `@strawberry.enum` to build the GraphQL schema automatically.

```python
@strawberry.enum
class OrderStatus(Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    PROCESSING = "PROCESSING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
```

Strawberry exposes this as a GraphQL enum. When the client sends `status: PENDING`, Strawberry deserializes it to `OrderStatus.PENDING` before it reaches the resolver.

```python
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
```

This is the GraphQL `Order` type. `strawberry.ID` is a special scalar that serializes as a string. Strawberry converts Python snake_case field names to GraphQL camelCase automatically — `user_id` becomes `userId` on the wire, `created_at` becomes `createdAt`.

**Input types** are used for mutation arguments:
```python
@strawberry.input
class CreateOrderInput:
    product: str
    quantity: int
    price: float
    type: OrderType
```
Note there is no `customerName` here — it is filled in server-side from the authenticated user's name, preventing a user from impersonating someone else.

---

### 3.6 GraphQL Schema — Resolvers

**File: `schema/resolvers.py`**

**Auth helpers:**
```python
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
```
These are called at the top of every protected resolver. `info.context` is the `AppContext` object (explained in section 3.8). `load_user()` reads the JWT from the request headers or WebSocket query params, decodes it, and fetches the user from the database — but only once per request (it's cached after the first call).

**Queries:**
```python
@strawberry.field
async def orders(self, info: Info) -> List[Order]:
    db = info.context["db"]
    user = await require_auth(info)
    if user.role == UserRole.ADMIN.value:
        result = await db.execute(select(OrderModel))
    else:
        result = await db.execute(
            select(OrderModel).where(OrderModel.user_id == user.id)
        )
    return [model_to_order(o) for o in result.scalars().all()]
```
The `orders` query applies row-level filtering: admins see everything; regular users only see their own rows. The same pattern applies to `orders_by_status`, `orders_by_type`, and `orders_by_order_id`.

**Mutations:**

`register` — creates a new user:
```python
user = UserModel(
    id=str(uuid.uuid4()),
    name=input.name,
    email=input.email,
    password_hash=hash_password(input.password),
    role=input.role.value,
)
db.add(user)
await db.commit()
return AuthPayload(token=create_access_token(user.id), user=model_to_user(user))
```
It immediately returns a JWT so the client can be logged in right after registering.

`create_order` — places a new order:
```python
user = await require_auth(info)
new_model = OrderModel(
    id=str(uuid.uuid4()),
    user_id=user.id,
    customer_name=user.name,   # pulled from the authenticated user, not user input
    product=input.product,
    ...
    status=OrderStatus.PENDING.value,
    created_at=datetime.now(timezone.utc).isoformat(),
)
db.add(new_model)
await db.commit()
order = model_to_order(new_model)
await redis_client.publish("ORDER_CREATED", order_to_dict(order))
return order
```
After saving to the database, the order is serialised to a dictionary and **published to the Redis channel `ORDER_CREATED`**. Any active subscription listening on that channel will immediately receive this event.

`update_order_status` — changes an order's status:
```python
order_model.status = status.value
await db.commit()
order = model_to_order(order_model)
await redis_client.publish("ORDER_STATUS_UPDATED", order_to_dict(order))
return order
```
Same pattern — save to DB, publish to Redis channel `ORDER_STATUS_UPDATED`.

---

### 3.7 Real-Time Subscriptions with Redis

**File: `redis_client.py`**

```python
async def publish(channel: str, data: dict) -> None:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    try:
        await r.publish(channel, json.dumps(data))
    finally:
        await r.aclose()

async def create_pubsub():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    pubsub = r.pubsub()
    return r, pubsub
```

- `publish` opens a connection, serialises the dict to JSON, publishes it to the named channel, and closes the connection.
- `create_pubsub` opens a long-lived connection and returns a `pubsub` object for subscribing. This connection is kept open for the entire duration of a GraphQL subscription.

**How a Subscription Works (step by step):**

```python
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
                # Only yield events this user is allowed to see
                if user.role != UserRole.ADMIN.value and str(order.user_id) != user.id:
                    continue
                if order_id and str(order.id) != str(order_id):
                    continue
                yield order
    finally:
        await pubsub.unsubscribe("ORDER_STATUS_UPDATED")
        await r.aclose()
```

1. When a client opens a WebSocket subscription, this async generator starts.
2. It authenticates the user first — unauthenticated WebSocket connections are rejected.
3. It opens a Redis Pub/Sub listener on the `ORDER_STATUS_UPDATED` channel.
4. `async for message in pubsub.listen()` blocks asynchronously, yielding each time Redis delivers a message.
5. Each message is deserialised back to an `Order` object.
6. **Filtering:** Regular users only receive events for their own orders. Admins receive all events. If a specific `order_id` was requested, only that order's events pass through.
7. Each `yield order` sends the order data as a GraphQL subscription event to the connected client.
8. When the client disconnects, the `finally` block closes the Redis connection cleanly.

---

### 3.8 Request Context — How Auth Flows into Every Resolver

**File: `main.py`**

The context is the object that Strawberry passes as `info.context` into every resolver. The challenge is that auth needs to work for both regular HTTP requests (queries/mutations) and WebSocket connections (subscriptions), but FastAPI handles these two connection types very differently.

**The solution — `AppContext(BaseContext)`:**

```python
class AppContext(BaseContext):
    def __init__(self, db: AsyncSession):
        super().__init__()
        self.db = db
        self.current_user = None
        self._user_loaded = False

    async def load_user(self):
        if self._user_loaded:
            return self.current_user
        self._user_loaded = True

        conn = self.request or self.websocket  # Strawberry sets these automatically
        token = None
        if conn:
            auth_header = conn.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
            else:
                token = conn.query_params.get("token")  # For WebSocket connections

        if token:
            user_id = decode_token(token)
            if user_id:
                result = await self.db.execute(
                    select(UserModel).where(UserModel.id == user_id)
                )
                self.current_user = result.scalar_one_or_none()
        return self.current_user
```

- `BaseContext` is a Strawberry class that automatically receives the `request` object for HTTP connections and the `websocket` object for WebSocket connections. This avoids any FastAPI type-validation problems.
- `load_user()` is **lazy** — it only runs the database query the first time it's called. After that, `_user_loaded = True` causes it to return the cached result immediately.
- For HTTP requests, the JWT is in the `Authorization: Bearer <token>` header.
- For WebSocket connections, the browser cannot set custom headers, so the token is passed as a URL query parameter: `ws://localhost:4000/graphql?token=<jwt>`.

```python
async def get_context(db: AsyncSession = Depends(get_db)) -> AppContext:
    return AppContext(db=db)
```

FastAPI only sees `db: AsyncSession` as a parameter — something it knows how to inject. The `Request` / `WebSocket` injection happens internally via `BaseContext`, completely bypassing FastAPI's parameter validation.

---

### 3.9 Application Entry Point

**File: `main.py`**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()                            # Create tables if they don't exist
    async with AsyncSessionLocal() as db:
        await seed_menu_items(db)              # Populate menu on first run
    yield                                      # App runs here
```

The `lifespan` context manager runs setup code before the server accepts any requests and teardown code after it stops. Using `yield` is the FastAPI pattern for this.

```python
schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)

graphql_app = GraphQLRouter(
    schema,
    context_getter=get_context,
    subscription_protocols=[
        GRAPHQL_TRANSPORT_WS_PROTOCOL,
        GRAPHQL_WS_PROTOCOL,
    ],
)

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)
app.include_router(graphql_app, prefix="/graphql")
```

- The entire API — queries, mutations, and subscriptions — is served from a single endpoint: `/graphql`.
- Two WebSocket sub-protocols are registered: `graphql-transport-ws` (modern) and `graphql-ws` (legacy), so the client can use either.
- CORS is set to `allow_origins=["*"]` for local development. This should be restricted to the frontend's domain in production.

---

## 4. Frontend — Deep Dive

### 4.1 Project Structure

```
food-server-client/
├── app/
│   ├── layout.tsx           # Root layout — wraps everything in providers
│   ├── page.tsx             # Home page — role-conditional dashboard cards
│   ├── login/page.tsx       # Login form
│   ├── register/page.tsx    # Registration form
│   ├── new-orders/page.tsx  # Place a new order (users only)
│   ├── your-orders/page.tsx # Track your orders with live timeline
│   ├── view-orders/page.tsx # Filterable order list with cancel option
│   ├── live-orders/page.tsx # Admin: real-time incoming orders feed
│   └── sell-orders/page.tsx # Admin: sell-type order management
├── components/
│   ├── Navigation.tsx       # Top nav bar with role-based links
│   ├── AuthGuard.tsx        # Route protection wrapper
│   ├── OrderForm.tsx        # Menu-driven order creation form
│   ├── OrderCard.tsx        # Single order display card with actions
│   ├── OrderList.tsx        # Grid of OrderCards
│   ├── OrderTimeline.tsx    # Visual step-by-step order progress
│   └── SalesCard.tsx        # Summary stats card
├── lib/
│   ├── apollo-client.ts     # Apollo Client setup (HTTP + WebSocket)
│   ├── apollo-provider.tsx  # Wraps the app in ApolloProvider
│   ├── auth-context.tsx     # Auth state management (React Context)
│   └── graphql/
│       ├── queries.ts       # GQL query documents
│       ├── mutation.ts      # GQL mutation documents
│       └── subscription.ts  # GQL subscription documents
└── types/
    └── order.ts             # TypeScript type definitions
```

---

### 4.2 Apollo Client Setup

**File: `lib/apollo-client.ts`**

The Apollo Client must handle two different network protocols — HTTP for queries/mutations, and WebSocket for subscriptions. It uses Apollo's `ApolloLink.split` to route operations to the right transport.

```typescript
const httpLink = new HttpLink({ uri: 'http://localhost:4000/graphql' })

const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  },
}))
```

`authLink` intercepts every HTTP request and adds the `Authorization` header if a token is in `localStorage`. `setContext` runs just before each request, so it always picks up the latest token.

```typescript
const wsLink = new GraphQLWsLink(
  createClient({
    url: () => {
      const token = getToken()
      return token
        ? `ws://localhost:4000/graphql?token=${encodeURIComponent(token)}`
        : `ws://localhost:4000/graphql`
    },
  })
)
```

The WebSocket URL is a function (not a static string) so the token is evaluated at connection time. The token is appended as a query parameter because browsers do not allow setting custom headers on WebSocket connections.

```typescript
const link = ApolloLink.split(
  ({ query }) => {
    const def = getMainDefinition(query)
    return def.kind === 'OperationDefinition' && def.operation === 'subscription'
  },
  wsLink,
  authLink.concat(httpLink)
)
```

`getMainDefinition` parses the GraphQL document AST and checks if the operation type is `"subscription"`. If yes, the request goes to `wsLink`. Everything else goes through `authLink` → `httpLink`.

> **Why AST inspection and not `operationType`?** Apollo's `Operation` object does not have an `operationType` property at the link level. Checking the query document's AST is the only reliable method.

---

### 4.3 Authentication Context

**File: `lib/auth-context.tsx`**

The entire application's auth state lives in a React Context so any component can access it without prop drilling.

```typescript
const [user, setUser] = useState<AuthUser | null>(null)
const [token, setToken] = useState<string | null>(null)
const [initialized, setInitialized] = useState(false)

useEffect(() => {
  const storedToken = localStorage.getItem('auth_token')
  const storedUser = localStorage.getItem('auth_user')
  if (storedToken && storedUser) {
    setToken(storedToken)
    setUser(JSON.parse(storedUser))
  }
  setInitialized(true)  // marks that localStorage has been read
}, [])
```

- On first render, the component reads from `localStorage` to restore a previous session.
- `initialized` starts as `false` and is only set to `true` after the `localStorage` read completes.
- This is critical: without `initialized`, `isAuthenticated` would be `false` for a split second on page load even for a logged-in user, causing protected pages to briefly redirect to `/login`.

```typescript
const login = useCallback((newToken: string, newUser: AuthUser) => {
  localStorage.setItem('auth_token', newToken)
  localStorage.setItem('auth_user', JSON.stringify(newUser))
  setToken(newToken)
  setUser(newUser)
  client.resetStore().catch(() => {})  // Clear Apollo's cache — old data belongs to the previous user
}, [])

const logout = useCallback(() => {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  setToken(null)
  setUser(null)
  client.clearStore().catch(() => {})  // Wipe cache immediately without re-fetching
}, [])
```

`client.resetStore()` after login forces Apollo to re-fetch all active queries under the new user's identity. `client.clearStore()` after logout discards all cached data.

**Derived values** are computed directly in the provider value:
```typescript
isAuthenticated: !!token,
isAdmin: user?.role === 'ADMIN',
```

---

### 4.4 Route Protection with AuthGuard

**File: `components/AuthGuard.tsx`**

```typescript
export default function AuthGuard({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!initialized) return           // Wait for localStorage read to finish
    if (!isAuthenticated) {
      router.replace('/login')         // Not logged in → go to login
    } else if (adminOnly && !isAdmin) {
      router.replace('/')              // Logged in but not admin → go to home
    }
  }, [initialized, isAuthenticated, isAdmin, adminOnly, router])

  if (!initialized) return <Spinner />   // Show spinner while reading localStorage
  if (!isAuthenticated) return null      // Prevent flash of protected content
  if (adminOnly && !isAdmin) return null

  return <>{children}</>
}
```

Usage in a page:
```tsx
// Any logged-in user
<AuthGuard>
  <YourOrdersPage />
</AuthGuard>

// Admin only
<AuthGuard adminOnly>
  <LiveOrdersPage />
</AuthGuard>
```

The `initialized` check is what prevents the "redirect loop" bug: without it, the guard would redirect away on every load because `isAuthenticated` is `false` before `useEffect` runs.

---

### 4.5 Pages and Their Responsibilities

| Page | Route | Access | Description |
|---|---|---|---|
| Home | `/` | All | Role-conditional dashboard. Users see order shortcuts; admins see management shortcuts. |
| Login | `/login` | Public | Email/password login form. Redirects to `/` if already authenticated. |
| Register | `/register` | Public | Name/email/password/role registration. Role selector allows creating an admin account. |
| New Order | `/new-orders` | Users only | Menu-driven form. On submit, redirects to `/your-orders`. |
| Your Orders | `/your-orders` | Users only | Live order tracking with timeline. Subscribe to status updates. Cancel option on active orders. |
| View Orders | `/view-orders` | All | Filterable order list. Admins can change status; users can cancel. |
| Live Orders | `/live-orders` | Admin only | Real-time feed of incoming and updated orders. Admin changes status via dropdown. |
| Sell Orders | `/sell-orders` | Admin only | Manage sell-type orders. |

---

### 4.6 Real-Time Updates on the Frontend

There are two subscription documents defined in `lib/graphql/subscription.ts`:

**`ORDER_CREATED_SUBSCRIPTION`** — fires when any new order is placed:
```graphql
subscription OnOrderCreated {
  orderCreated {
    id userId customerName product quantity price status type createdAt
  }
}
```

**`ORDER_UPDATED_SUBSCRIPTION`** — fires when an order's status changes:
```graphql
subscription OnOrderUpdated($orderId: ID) {
  orderUpdated: orderStatusUpdated(orderId: $orderId) {
    id userId customerName product quantity price status type createdAt
  }
}
```
The `orderUpdated` alias renames the field on the client side so it's consistent regardless of the backend field name.

**How `your-orders` page uses both subscriptions:**

```typescript
// 1. Initial load — fetch all orders from DB
const { data, subscribeToMore } = useQuery(GET_ALL_ORDERS)

// 2. Subscribe to new orders — add them to the list as they arrive
subscribeToMore({
  document: ORDER_CREATED_SUBSCRIPTION,
  updateQuery: (prev, { subscriptionData }) => {
    const newOrder = subscriptionData.data.orderCreated
    return { orders: [newOrder, ...prev.orders] }
  }
})

// 3. Subscribe to status updates — update the relevant order in place
const { data: updatedData } = useSubscription(ORDER_UPDATED_SUBSCRIPTION)

useEffect(() => {
  if (!updatedData?.orderUpdated) return
  const updated = updatedData.orderUpdated
  setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
  setSelectedOrderDetails(prev => prev?.id === updated.id ? updated : prev)
}, [updatedData])
```

The `updateQuery` callback in `subscribeToMore` directly updates Apollo's cache, so the query result is reactive without any manual state management.

**How `live-orders` page (admin) handles subscriptions:**

```typescript
const { data: createdData } = useSubscription(ORDER_CREATED_SUBSCRIPTION)
const { data: updatedData } = useSubscription(ORDER_UPDATED_SUBSCRIPTION)

// New order arrives → prepend to list
useEffect(() => {
  if (createdData?.orderCreated) {
    setLiveOrders(prev => [createdData.orderCreated, ...prev])
  }
}, [createdData])

// Status changes anywhere → update that row in the table
useEffect(() => {
  if (updatedData?.orderUpdated) {
    setLiveOrders(prev =>
      prev.map(o => o.id === updatedData.orderUpdated.id ? updatedData.orderUpdated : o)
    )
  }
}, [updatedData])
```

The admin's table stays in sync without any polling or manual refresh.

---

### 4.7 Role-Based UI

Role checks happen in three places:

**1. Navigation bar** (`components/Navigation.tsx`):
```typescript
const navItems = [
  { href: '/new-orders', label: 'New Order',   show: isAuthenticated && !isAdmin },
  { href: '/your-orders', label: 'Your Orders', show: isAuthenticated },
  { href: '/live-orders', label: 'Live Orders', show: isAdmin },
  { href: '/sell-orders', label: 'Sell Orders', show: isAdmin },
  ...
]
// Items with show: false are filtered out before rendering
```

**2. Home page** (`app/page.tsx`):
```typescript
{!isAdmin && userRoutes.map(route => <Link .../>)}   // Only for regular users
{isAdmin  && adminRoutes.map(route => <Link .../>)}  // Only for admins
```

**3. Route guard** (`components/AuthGuard.tsx`):
Even if someone manually navigates to `/live-orders`, `AuthGuard adminOnly` will redirect non-admins back to `/`.

**4. `OrderList` / `OrderCard`**:
```typescript
<OrderList
  onStatusChange={isAdmin ? handleStatusChange : undefined}   // Admin: change status dropdown
  onCancel={!isAdmin ? handleCancel : undefined}              // User: cancel button
/>
```
Admins see a status dropdown. Regular users see a cancel button. The logic for which actions appear is isolated in `OrderCard`:
```typescript
{onStatusChange && cancellable(order.status) && <select .../>}
{onCancel && cancellable(order.status) && <button>Cancel Order</button>}
```
Where `cancellable` returns `false` for `COMPLETED` and `CANCELLED` statuses — a delivered or already-cancelled order cannot be touched.

---

## 5. End-to-End Feature Walkthroughs

### 5.1 User Registration and Login

1. User fills the register form → frontend calls `register` mutation with `{ name, email, password, role }`.
2. Backend checks that the email isn't already taken.
3. Password is hashed with bcrypt and a new `UserModel` row is inserted.
4. A JWT is created with `sub = user.id` and returned in `AuthPayload`.
5. Frontend's `login(token, user)` stores both in `localStorage`, updates React state, resets Apollo cache.
6. `AuthProvider.isAuthenticated` becomes `true`, `isAdmin` is set based on `user.role`.
7. All future HTTP requests carry `Authorization: Bearer <token>`.
8. WebSocket subscriptions connect with `?token=<jwt>` in the URL.

### 5.2 Placing an Order

1. User navigates to `/new-orders`. `AuthGuard` confirms they're logged in.
2. `OrderForm` loads the menu via `listOrderItems` query.
3. User selects an item, adjusts quantity. The form calculates the total from `menuItem.rate`.
4. On submit, `createOrder` mutation is called with `{ product, quantity, price, type }`.
5. Backend's `create_order` resolver:
   - Calls `require_auth(info)` → calls `load_user()` → reads JWT from `Authorization` header → fetches `UserModel` from DB.
   - Creates a new `OrderModel` with `user_id = user.id`, `customer_name = user.name`, `status = PENDING`.
   - Saves to PostgreSQL.
   - Publishes the serialised order to Redis channel `ORDER_CREATED`.
6. Any active `orderCreated` subscription receives the event via Redis and yields it to the subscribed client.
7. Frontend receives the mutation response, calls `router.push('/your-orders')`.
8. On `/your-orders`, `subscribeToMore` is active — the new order appears in the list in real-time.

### 5.3 Admin Updates Order Status — User Sees It Live

1. Admin navigates to `/live-orders`. `AuthGuard adminOnly` confirms they're an admin.
2. The page is actively subscribed to `ORDER_CREATED_SUBSCRIPTION` (new orders) and `ORDER_UPDATED_SUBSCRIPTION` (status changes).
3. A new order arrives via subscription — it's prepended to the admin's live table.
4. Admin selects a new status from the dropdown next to the order → `updateOrderStatus` mutation fires.
5. Backend's `update_order_status` resolver:
   - Calls `require_auth(info)`.
   - Loads the order from DB, checks the user has permission to update it.
   - Updates `status` column and commits.
   - Publishes the updated order to Redis channel `ORDER_STATUS_UPDATED`.
6. Redis delivers the message to all active subscribers on `ORDER_STATUS_UPDATED`.
7. The ordering user (on `/your-orders`) has an active `ORDER_UPDATED_SUBSCRIPTION`:
   - The subscription generator receives the Redis message.
   - It checks: `user.role != ADMIN` and `order.user_id == user.id` → passes the filter.
   - It `yield`s the updated order to the WebSocket.
   - Apollo Client receives the subscription data.
   - `useEffect` updates local state: the order in the sidebar gets the new status badge, and the `OrderTimeline` advances to the new step — all without any user action or page refresh.

### 5.4 Cancelling an Order

1. User sees a "Cancel Order" button on any active order (status not `COMPLETED` or `CANCELLED`).
2. Clicking it calls `updateOrderStatus({ id, status: "CANCELLED" })`.
3. Backend updates the DB and publishes to `ORDER_STATUS_UPDATED`.
4. The subscription delivers the `CANCELLED` status back to the same user.
5. `OrderTimeline` switches to showing the red "Order Cancelled" banner.
6. The cancel button disappears (the `cancellable()` check in `OrderCard` returns `false`).

---

## 6. Data Flow Diagram

```
BROWSER (Next.js)
│
│  HTTP (queries & mutations)
│  ─────────────────────────────────────────────────────────────────►
│                                                                    │
│                                                            FastAPI + Strawberry
│                                                            /graphql endpoint
│                                                                    │
│  WebSocket (subscriptions)                                         │
│  ◄─────────────────────────────────────────────────────────────────
│  ws://localhost:4000/graphql?token=<jwt>                           │
│                                                                    │
│                                                               ┌────┴────┐
│                                                               │ AppContext│
│                                                               │load_user │
│                                                               └────┬────┘
│                                                                    │
│                                                          ┌─────────┴──────────┐
│                                                          │                    │
│                                                    PostgreSQL              Redis
│                                                    (orders, users,     (Pub/Sub channels:
│                                                     menu_items)         ORDER_CREATED,
│                                                                         ORDER_STATUS_UPDATED)
│                                                                              │
│                                                                              │ publish on mutation
│                                                                              │ subscribe on subscription
│                                                                              │
│  ◄──────────────────────────── WebSocket event ──────────────────────────────
│  Apollo Client receives subscription data
│  useEffect updates React state
│  Component re-renders with new status / new order
```

**Key Principle:** Mutations write to PostgreSQL *and* publish to Redis. Subscriptions read from Redis (not from the database). This decoupling means the subscription fan-out is handled entirely by Redis, and the database is never polled for real-time updates.
