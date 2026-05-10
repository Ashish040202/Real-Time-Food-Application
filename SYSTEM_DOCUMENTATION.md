# Real-Time Food Application — System Documentation

This document explains the complete architecture, data flow, and code-level implementation of the Real-Time Food Application. It covers both the FastAPI/GraphQL backend and the Next.js frontend, and explains how every major feature works from end to end.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Design (HLD)](#3-high-level-design-hld)
   - 3.1 [Architectural Style](#31-architectural-style)
   - 3.2 [System Component Diagram](#32-system-component-diagram)
   - 3.3 [Component Responsibilities](#33-component-responsibilities)
   - 3.4 [Communication Protocols](#34-communication-protocols)
   - 3.5 [Data Storage Strategy](#35-data-storage-strategy)
   - 3.6 [Security Architecture](#36-security-architecture)
   - 3.7 [Real-Time Messaging Architecture](#37-real-time-messaging-architecture)
   - 3.8 [Role-Based Access Model](#38-role-based-access-model)
   - 3.9 [Scalability Considerations](#39-scalability-considerations)
   - 3.10 [Deployment Topology](#310-deployment-topology)
4. [Low-Level Design (LLD)](#4-low-level-design-lld)
   - 4.1 [Database Schema — Entity Relationship Diagram](#41-database-schema--entity-relationship-diagram)
   - 4.2 [Order Status State Machine](#42-order-status-state-machine)
   - 4.3 [GraphQL API Contract](#43-graphql-api-contract)
   - 4.4 [Redis Channel and Queue Design](#44-redis-channel-and-queue-design)
   - 4.5 [AppContext Class Design](#45-appcontext-class-design)
   - 4.6 [Notification Worker Module Design](#46-notification-worker-module-design)
   - 4.7 [Event Logging Design](#47-event-logging-design)
   - 4.8 [Sequence Diagrams](#48-sequence-diagrams)
   - 4.9 [Frontend Module Design](#49-frontend-module-design)
   - 4.10 [Error Handling Strategy](#410-error-handling-strategy)
5. [Backend — Deep Dive](#5-backend--deep-dive)
   - 5.1 [Project Structure](#51-project-structure)
   - 5.2 [Database Layer](#52-database-layer)
   - 5.3 [Models](#53-models)
   - 5.4 [Authentication](#54-authentication)
   - 5.5 [GraphQL Schema — Types](#55-graphql-schema--types)
   - 5.6 [GraphQL Schema — Resolvers](#56-graphql-schema--resolvers)
   - 5.7 [Real-Time Subscriptions with Redis](#57-real-time-subscriptions-with-redis)
   - 5.8 [Request Context — How Auth Flows into Every Resolver](#58-request-context--how-auth-flows-into-every-resolver)
   - 5.9 [Application Entry Point](#59-application-entry-point)
   - 5.10 [Event Logging — Order Audit Trail](#510-event-logging--order-audit-trail)
   - 5.11 [Notification System](#511-notification-system)
6. [Frontend — Deep Dive](#6-frontend--deep-dive)
   - 6.1 [Project Structure](#61-project-structure)
   - 6.2 [Apollo Client Setup](#62-apollo-client-setup)
   - 6.3 [Authentication Context](#63-authentication-context)
   - 6.4 [Route Protection with AuthGuard](#64-route-protection-with-authguard)
   - 6.5 [Pages and Their Responsibilities](#65-pages-and-their-responsibilities)
   - 6.6 [Real-Time Updates on the Frontend](#66-real-time-updates-on-the-frontend)
   - 6.7 [Role-Based UI](#67-role-based-ui)
   - 6.8 [Notification Bell Component](#68-notification-bell-component)
   - 6.9 [Order History Page](#69-order-history-page)
7. [End-to-End Feature Walkthroughs](#7-end-to-end-feature-walkthroughs)
   - 7.1 [User Registration and Login](#71-user-registration-and-login)
   - 7.2 [Placing an Order](#72-placing-an-order)
   - 7.3 [Admin Updates Order Status — User Sees It Live](#73-admin-updates-order-status--user-sees-it-live)
   - 7.4 [Cancelling an Order](#74-cancelling-an-order)
   - 7.5 [Notification Delivery — End to End](#75-notification-delivery--end-to-end)
   - 7.6 [Admin Inspects Order History](#76-admin-inspects-order-history)
8. [Data Flow Diagram](#8-data-flow-diagram)

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

## 3. High-Level Design (HLD)

### 3.1 Architectural Style

The system follows a **three-tier, event-driven architecture**. All real-time behaviour is built on Redis as a central message backbone — mutations write to it, subscriptions read from it, and background workers consume from it independently.

```
╔══════════════════════════════════════════════════════════════════╗
║  TIER 1 — PRESENTATION                                           ║
║                                                                  ║
║   Browser (Next.js 14)                                           ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │  React Pages  │  Apollo Client  │  Auth Context         │   ║
║   │  AuthGuard    │  HTTP + WS link │  NotificationBell     │   ║
║   └─────────────────────────────────────────────────────────┘   ║
╚══════════════════╤═══════════════════════╤═══════════════════════╝
                   │ HTTP POST /graphql     │ WebSocket ws:// /graphql
                   │ (queries, mutations)   │ (subscriptions)
╔══════════════════▼═══════════════════════▼═══════════════════════╗
║  TIER 2 — APPLICATION                                            ║
║                                                                  ║
║   FastAPI + Strawberry GraphQL          background asyncio tasks ║
║   ┌──────────────────────────┐         ┌──────────────────────┐  ║
║   │  Resolvers               │         │ notification_worker  │  ║
║   │  Query / Mutation / Sub  │         │  run_subscriber()    │  ║
║   │  require_auth / admin    │         │  run_worker()        │  ║
║   │  AppContext (JWT+Lock)   │         │  _process_job()      │  ║
║   └──────────┬───────────────┘         └──────────┬───────────┘  ║
╚══════════════╪══════════════════════════════════════╪════════════╝
               │ SQL / asyncpg                        │ aioredis
╔══════════════▼══════════════════╗  ╔════════════════▼════════════╗
║  TIER 3A — PERSISTENT STORE     ║  ║  TIER 3B — MESSAGE BROKER   ║
║                                 ║  ║                              ║
║  PostgreSQL                     ║  ║  Redis                       ║
║  ┌─────────────┐                ║  ║  ┌────────────────────────┐  ║
║  │ users       │                ║  ║  │ Pub/Sub channels       │  ║
║  │ orders      │                ║  ║  │  ORDER_CREATED         │  ║
║  │ menu_items  │                ║  ║  │  ORDER_STATUS_UPDATED  │  ║
║  │ order_events│ ← append-only  ║  ║  │  NOTIFICATION:{uid}   │  ║
║  │ notifications│               ║  ║  ├────────────────────────┤  ║
║  └─────────────┘                ║  ║  │ List (job queue)       │  ║
║                                 ║  ║  │  patiala_house:        │  ║
║                                 ║  ║  │  notifications:queue   │  ║
╚═════════════════════════════════╝  ╚══════════════════════════════╝
```

Key architectural decisions:
- **Single `/graphql` endpoint** — queries, mutations, and subscriptions share one URL; Apollo routes by operation type.
- **Event-driven fan-out** — mutations publish to Redis channels; subscriptions consume from them. The DB is never polled for live updates.
- **Decoupled notification pipeline** — all notification logic runs in isolated background tasks; a notification failure never affects the HTTP response.
- **Event Sourcing for audit** — every order state change appends an immutable `order_events` row rather than overwriting status.

---

### 3.2 System Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BROWSER  (Next.js)                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                     Apollo Client                           │     │
│  │                                                             │     │
│  │  authLink ──► httpLink  ◄── HTTP ops (query / mutation)     │     │
│  │                                                             │     │
│  │  wsLink  (GraphQLWsLink)◄── subscription ops               │     │
│  │    connectionParams: { Authorization: "Bearer <jwt>" }      │     │
│  │                                                             │     │
│  │  ApolloLink.split(isSubscription?, wsLink, httpLink)        │     │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  React Components                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐    │
│  │  AuthGuard   │ │  Pages       │ │  NotificationBell          │    │
│  │  (redirect   │ │  /new-orders │ │  useQuery MY_NOTIFICATIONS │    │
│  │   if unauth) │ │  /your-orders│ │  useSubscription NOTIF_SUB │    │
│  │              │ │  /live-orders│ │  suppression logic         │    │
│  │              │ │  /order-hist │ │  mark read mutations       │    │
│  └──────────────┘ └──────────────┘ └───────────────────────────┘    │
└───────────────┬──────────────────────────────┬───────────────────────┘
                │                              │
     HTTP POST /graphql              WebSocket ws:///graphql
     Authorization: Bearer <jwt>     graphql-transport-ws protocol
                │                              │
┌───────────────▼──────────────────────────────▼───────────────────────┐
│                     FASTAPI  SERVER                                   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Strawberry GraphQLRouter                                        │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────────────┐ │  │
│  │  │  HTTP handler    │  │  WebSocket handler                   │ │  │
│  │  │  (queries,       │  │  graphql-transport-ws protocol        │ │  │
│  │  │   mutations)     │  │  stores connection_params from       │ │  │
│  │  │                  │  │  connection_init on AppContext        │ │  │
│  │  └────────┬─────────┘  └──────────────┬───────────────────────┘ │  │
│  └───────────┼──────────────────────────┼─────────────────────────┘  │
│              └──────────────┬───────────┘                             │
│                             │ info.context  (AppContext instance)      │
│  ┌──────────────────────────▼───────────────────────────────────────┐ │
│  │  AppContext (BaseContext)                                         │ │
│  │  db: AsyncSession   current_user: UserModel?                     │ │
│  │  _load_lock: asyncio.Lock                                        │ │
│  │  load_user() ── token from headers / connection_params           │ │
│  │               ── decode_token() ── db.execute(SELECT user)       │ │
│  └──────────────────────────┬───────────────────────────────────────┘ │
│                             │                                          │
│  ┌──────────────────────────▼───────────────────────────────────────┐ │
│  │  Resolvers                                                        │ │
│  │  require_auth() / require_admin()                                 │ │
│  │                                                                   │ │
│  │  Query          Mutation              Subscription                │ │
│  │  ─────────────  ─────────────────────  ──────────────────────── │ │
│  │  orders         createOrder ───────►  orderCreated               │ │
│  │  myNotifications updateOrderStatus ► orderStatusUpdated          │ │
│  │  orderHistory   markNotifRead        notificationReceived        │ │
│  └────────────────────────┬──────────────────────────┬──────────────┘ │
│                           │  SQLAlchemy ORM           │ redis_client   │
│              ┌────────────▼──────┐       ┌────────────▼─────────────┐ │
│              │  asyncpg driver   │       │  publish(channel, data)  │ │
│              │  AsyncSession     │       │  create_pubsub()         │ │
│              └────────────┬──────┘       └────────────┬─────────────┘ │
│                           │                           │               │
│  ┌────────────────────────┼───────────────────────────┼─────────────┐ │
│  │  notification_worker.py (background asyncio tasks) │             │ │
│  │                        │                           │             │ │
│  │  run_subscriber() ◄────┼───────────────────────────┘             │ │
│  │       │  subscribes to ORDER_CREATED, ORDER_STATUS_UPDATED        │ │
│  │       │  LPUSH jobs to Redis List queue                           │ │
│  │       ▼                │                                          │ │
│  │  run_worker()          │                                          │ │
│  │       │  BRPOP from queue                                         │ │
│  │       │  _process_job() ──► INSERT NotificationModel             │ │
│  │       └────────────────────► publish NOTIFICATION:{uid}          │ │
│  └────────────────────────────────────────────────────────────────── ┘ │
└────────────────┬────────────────────────────────┬─────────────────────┘
                 │  SQL                            │  aioredis
    ┌────────────▼──────────┐        ┌─────────────▼──────────────────┐
    │  PostgreSQL            │        │  Redis                          │
    │  users                 │        │  Pub/Sub channels               │
    │  orders                │        │  ┌──────────────────────────┐  │
    │  menu_items            │        │  │ ORDER_CREATED            │  │
    │  order_events          │        │  │ ORDER_STATUS_UPDATED     │  │
    │  notifications         │        │  │ NOTIFICATION:{user_id}  │  │
    └───────────────────────┘        │  └──────────────────────────┘  │
                                     │  List (job queue)               │
                                     │  ┌──────────────────────────┐  │
                                     │  │ patiala_house:           │  │
                                     │  │ notifications:queue      │  │
                                     │  │  [job][job][job]  →      │  │
                                     │  │  LPUSH ◄  BRPOP ►        │  │
                                     │  └──────────────────────────┘  │
                                     └────────────────────────────────┘
```

---

### 3.3 Redis Pub/Sub Architecture

Redis Pub/Sub is the real-time spine of the system. Mutations are the publishers; GraphQL subscription resolvers and the notification subscriber are the consumers. They are fully decoupled — a mutation publishes and moves on, with no knowledge of how many clients are listening.

```
                         REDIS PUB/SUB ENGINE
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   PUBLISHERS                    CHANNELS          SUBSCRIBERS   │
  │                                                                  │
  │  createOrder          ──────► ORDER_CREATED ──►  orderCreated   │
  │  mutation                          │              subscription   │
  │                                    │              (each connected │
  │                                    └──────────►   admin browser) │
  │                                                                  │
  │  updateOrderStatus    ──► ORDER_STATUS_UPDATED ► orderStatus    │
  │  mutation                          │              Updated sub    │
  │                                    │              (each user's   │
  │                                    └──────────►   browser)      │
  │                                                                  │
  │                    BOTH channels ──► notification subscriber    │
  │                                      (run_subscriber task)      │
  │                                            │                    │
  │                                            ▼                    │
  │                                     [enqueue to List]           │
  │                                            │                    │
  │                                            ▼                    │
  │  notification         ─► NOTIFICATION: ◄─ worker               │
  │  worker                  {user_id}         (_process_job)       │
  │  (_process_job)                            publishes after      │
  │                                            writing to DB        │
  │                                                │                │
  │                                                ▼                │
  │                                    notificationReceived sub     │
  │                                    (each user's browser WS)     │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

  Message lifetime:
  ┌──────────────────────────────────────────────────────────┐
  │  ORDER_CREATED / ORDER_STATUS_UPDATED                    │
  │  → ephemeral — delivered to active subscribers only      │
  │  → if no subscriber is connected, message is lost        │
  │                                                          │
  │  NOTIFICATION:{uid}                                      │
  │  → ephemeral — but NotificationModel is always written   │
  │    to PostgreSQL first, so missed push is recoverable    │
  │    on next page load via MY_NOTIFICATIONS query          │
  └──────────────────────────────────────────────────────────┘
```

---

### 3.4 Notification Queue Architecture

The notification queue decouples the subscriber (who hears Redis events) from the worker (who writes to the DB and pushes to users). This means:
- A slow DB write does not block the subscriber from receiving the next event.
- Jobs survive a brief worker restart because they sit in the Redis List until consumed.

```
  ┌────────────────────────────────────────────────────────────────────┐
  │               NOTIFICATION PIPELINE                                │
  │                                                                    │
  │  ① ORDER_CREATED arrives on Redis Pub/Sub                          │
  │  ② ORDER_STATUS_UPDATED arrives (status=CANCELLED or COMPLETED)   │
  │                                                                    │
  │      run_subscriber()  (always-on asyncio task)                    │
  │      ┌─────────────────────────────────────────────┐              │
  │      │  async for message in pubsub.listen():       │              │
  │      │    channel == ORDER_CREATED?                 │              │
  │      │      → add job {type:NEW_ORDER, ...}         │              │
  │      │    channel == ORDER_STATUS_UPDATED?          │              │
  │      │      status == CANCELLED?                    │              │
  │      │        → add job {type:ORDER_CANCELLED, ...} │              │
  │      │      status == COMPLETED?                    │              │
  │      │        → add job {type:ORDER_COMPLETED, ...} │              │
  │      └─────────────────────┬───────────────────────┘              │
  │                            │  LPUSH (add to head of list)          │
  │                            ▼                                       │
  │      ┌──────────────────────────────────────────────────────┐     │
  │      │  Redis List: "patiala_house:notifications:queue"      │     │
  │      │                                                       │     │
  │      │  HEAD ← [job3][job2][job1] → TAIL                    │     │
  │      │          LPUSH adds here    BRPOP removes here        │     │
  │      │          (newest first)     (oldest first = FIFO)     │     │
  │      └─────────────────────────────────┬────────────────────┘     │
  │                                        │  BRPOP timeout=1s         │
  │                                        ▼                           │
  │      run_worker()  (always-on asyncio task)                        │
  │      ┌─────────────────────────────────────────────────────┐      │
  │      │  while True:                                         │      │
  │      │    result = await r.brpop(QUEUE_KEY, timeout=1)      │      │
  │      │    if result: await _process_job(job)                │      │
  │      └──────────────────────────┬──────────────────────────┘      │
  │                                 │                                  │
  │      _process_job()             │                                  │
  │      ┌──────────────────────────▼──────────────────────────┐      │
  │      │                                                      │      │
  │      │  job_type == NEW_ORDER or ORDER_CANCELLED?           │      │
  │      │  ┌─────────────────────────────────────────────┐    │      │
  │      │  │  SELECT all ADMIN users from PostgreSQL      │    │      │
  │      │  │  FOR each admin:                             │    │      │
  │      │  │    INSERT NotificationModel (recipient=admin) │   │      │
  │      │  │    db.flush()                                │    │      │
  │      │  │    r.publish(NOTIFICATION:{admin.id}, ...)   │    │      │
  │      │  │  db.commit()                                 │    │      │
  │      │  └─────────────────────────────────────────────┘    │      │
  │      │                                                      │      │
  │      │  job_type == ORDER_COMPLETED?                        │      │
  │      │  ┌─────────────────────────────────────────────┐    │      │
  │      │  │  INSERT NotificationModel (recipient=user_id) │   │      │
  │      │  │  db.flush() + db.commit()                    │    │      │
  │      │  │  r.publish(NOTIFICATION:{user_id}, ...)      │    │      │
  │      │  └─────────────────────────────────────────────┘    │      │
  │      │                                                      │      │
  │      │  SUPPRESSION:                                        │      │
  │      │  ORDER_CANCELLED + triggered_by_role==ADMIN → skip  │      │
  │      └──────────────────────────────────────────────────────┘     │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘

  Notification delivery — final hop:

  NOTIFICATION:{uid} channel
         │
         ▼
  notificationReceived GraphQL subscription
  (async generator in resolvers.py)
         │
         ▼
  WebSocket → Apollo Client
         │
         ▼
  NotificationBell.tsx
    → suppressed? (user on /your-orders or admin on /live-orders)
        YES → discard from state, badge stays 0
              (row is in DB — visible on next page load)
        NO  → prepend to notifications[], increment unread badge
```

---

### 3.5 Event Logging (Event Sourcing) Architecture

Every order state transition appends an immutable row to `order_events`. Nothing in the system ever updates or deletes these rows. The complete history of any order can be reconstructed at any time.

```
  ┌────────────────────────────────────────────────────────────────────┐
  │               EVENT SOURCING PIPELINE                              │
  │                                                                    │
  │   USER ACTION            MUTATION              DATABASE            │
  │                                                                    │
  │  Place order ──────► createOrder()             orders table        │
  │                          │                     ┌──────────────┐   │
  │                          ├── db.add(Order)  ──► │ id           │   │
  │                          ├── db.flush()     ──► │ status:PEND  │   │
  │                          │   (FK satisfied)     │ ...          │   │
  │                          │                      └──────────────┘   │
  │                          │                      order_events table  │
  │                          └── record_event() ──► ┌──────────────┐   │
  │                              ORDER_PLACED        │ order_id     │   │
  │                              db.add(event)   ──► │ ORDER_PLACED │   │
  │                              db.commit()         │ new:PENDING  │   │
  │                              (atomic)            │ old:null     │   │
  │                                                  │ actor:user   │   │
  │                                                  │ timestamp    │   │
  │                                                  └──────────────┘   │
  │                                                                    │
  │  Change status ────► updateOrderStatus()        orders table        │
  │                          │                     ┌──────────────┐   │
  │                          ├── capture old_status │ status:ACCPT │   │
  │                          ├── order.status=new   │ (updated)    │   │
  │                          │                      └──────────────┘   │
  │                          │                      order_events table  │
  │                          └── record_event() ──► ┌──────────────┐   │
  │                              STATUS_CHANGED      │ order_id     │   │
  │                              db.add(event)   ──► │ STATUS_CHNG  │   │
  │                              db.commit()         │ old:PENDING  │   │
  │                              (atomic)            │ new:ACCEPTED │   │
  │                                                  │ actor:admin  │   │
  │                                                  │ timestamp    │   │
  │                                                  └──────────────┘   │
  │                                                                    │
  │   Each status change appends one more row — never overwrites.      │
  │                                                                    │
  │   QUERY PATH (admin only)                                          │
  │                                                                    │
  │   Admin opens /order-history                                       │
  │         │                                                          │
  │         ▼                                                          │
  │   allOrdersWithEvents ──► SELECT * FROM orders ORDER BY created_at │
  │         │                                                          │
  │   Admin clicks order                                               │
  │         │                                                          │
  │         ▼                                                          │
  │   orderHistory(orderId)                                            │
  │     ├── SELECT * FROM orders WHERE id = ?                         │
  │     └── SELECT * FROM order_events WHERE order_id = ?             │
  │                          ORDER BY timestamp ASC                   │
  │                                                                    │
  │   Frontend renders timeline:                                       │
  │                                                                    │
  │   [ORDER_PLACED]──3m──[STATUS_CHANGED]──8m──[STATUS_CHANGED]──4m──[STATUS_CHANGED]
  │   PENDING              ACCEPTED              PROCESSING            COMPLETED
  │   by: user             by: admin             by: admin             by: admin
  │   10:00:00             10:03:14              10:11:45              10:15:52   │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
```

---

### 3.6 WebSocket Subscription & Authentication Architecture

```
  ┌────────────────────────────────────────────────────────────────────┐
  │           WEBSOCKET LIFECYCLE & AUTH FLOW                          │
  │                                                                    │
  │  Browser (graphql-ws client)        Server (Strawberry)           │
  │                                                                    │
  │  1. TCP + WS upgrade                                               │
  │     ──────────────────────────────►                               │
  │                                     Strawberry calls              │
  │                                     get_context(db=...)           │
  │                                     → AppContext created           │
  │                                       _user_loaded = False         │
  │                                       connection_params = None     │
  │                                                                    │
  │  2. connection_init                                                │
  │     { payload: { Authorization: "Bearer <jwt>" } }                │
  │     ──────────────────────────────►                               │
  │                                     context.connection_params     │
  │                                       = { Authorization: "..." }  │
  │                                                                    │
  │                                    ◄── connection_ack             │
  │                                                                    │
  │  3. subscribe (e.g. orderCreated + notificationReceived)          │
  │     Both fire concurrently                                         │
  │     ──────────────────────────────►                               │
  │                                                                    │
  │                                     RACE CONDITION PREVENTION:    │
  │                                     Both resolvers call           │
  │                                     load_user() on SAME context   │
  │                                                                    │
  │                                     Coroutine A          Coroutine B
  │                                     load_user()          load_user()
  │                                     _user_loaded=F       _user_loaded=F
  │                                     acquire Lock  ──►    wait on Lock
  │                                     decode token                  │
  │                                     await db.execute()            │
  │                                     current_user = user           │
  │                                     _user_loaded = True           │
  │                                     release Lock  ──►    acquire Lock
  │                                                          _user_loaded=T
  │                                                          return user (cached)
  │                                                          release Lock
  │                                                                    │
  │  4. next (subscription data pushed on each Redis message)          │
  │                                    ◄── { type:next, data:{...} }  │
  │                                    ◄── { type:next, data:{...} }  │
  │                                                                    │
  │  5. complete / disconnect                                           │
  │     ──────────────────────────────►                               │
  │                                     finally block:                │
  │                                     pubsub.unsubscribe()          │
  │                                     r.close()                     │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
```

---

### 3.7 Complete End-to-End Real-Time Flow

This diagram shows all three systems (Pub/Sub, Queue, Event Logging) working together when an admin marks an order as COMPLETED.

```
BROWSER (Admin)               FASTAPI SERVER                  REDIS              POSTGRESQL
      │                             │                            │                    │
      │── updateOrderStatus ───────►│                            │                    │
      │   (id, COMPLETED)           │                            │                    │
      │                             │── require_auth() ─────────────────────────────►│
      │                             │◄── UserModel ──────────────────────────────────│
      │                             │                            │                    │
      │                             │── capture old_status       │                    │
      │                             │── order.status = COMPLETED │                    │
      │                             │── record_event() ─────────────────────────────►│
      │                             │   STATUS_CHANGED            │                   │
      │                             │   old:PROCESSING            │       order_events│
      │                             │   new:COMPLETED             │       row INSERT  │
      │                             │── db.commit() ─────────────────────────────────►│
      │                             │                            │                    │
      │◄── Order (response) ────────│                            │                    │
      │                             │── publish() ──────────────►│                    │
      │                             │   ORDER_STATUS_UPDATED      │                    │
      │                             │   { status:COMPLETED,      │                    │
      │                             │     triggered_by_role:ADMIN}│                   │
      │                             │                            │                    │
  ════════════════════════════ CONCURRENTLY ═══════════════════════════════════════════
      │                             │                            │                    │
  [Admin's orderStatusUpdated subscription]                      │                    │
      │                             │◄── message ───────────────│                    │
      │                             │    ORDER_STATUS_UPDATED    │                    │
      │                             │── filter: admin sees all   │                    │
      │◄── subscription event ──────│── yield order              │                    │
      │    live-orders table        │                            │                    │
      │    row updates in-place     │                            │                    │
      │                             │                            │                    │
  [User's orderStatusUpdated subscription]                       │                    │
  BROWSER (User)                   │◄── message ───────────────│                    │
      │                             │    ORDER_STATUS_UPDATED    │                    │
      │                             │── filter: user_id matches  │                    │
      │◄── subscription event ──────│── yield order              │                    │
      │    your-orders timeline     │                            │                    │
      │    advances to COMPLETED    │                            │                    │
      │                             │                            │                    │
  [Notification subscriber — run_subscriber()]                   │                    │
      │                             │◄── message ───────────────│                    │
      │                             │    ORDER_STATUS_UPDATED    │                    │
      │                             │    status == COMPLETED     │                    │
      │                             │── notification_queue.add() │                    │
      │                             │   LPUSH job ──────────────►│                    │
      │                             │   {type:ORDER_COMPLETED,   │                    │
      │                             │    user_id: "..."}         │                    │
      │                             │                            │                    │
  [Notification worker — run_worker()]                           │                    │
      │                             │── BRPOP ──────────────────►│                    │
      │                             │◄── job ───────────────────│                    │
      │                             │── INSERT NotificationModel ────────────────────►│
      │                             │── db.flush() + commit() ──────────────────────►│
      │                             │── publish() ──────────────►│                    │
      │                             │   NOTIFICATION:{user_id}   │                    │
      │                             │                            │                    │
  [User's notificationReceived subscription]                     │                    │
      │◄── subscription event ──────│◄── message ───────────────│                    │
      │    (if NOT on /your-orders) │    NOTIFICATION:{user_id}  │                    │
      │    bell badge increments    │                            │                    │
      │                             │                            │                    │
```

---

### 3.8 Component Responsibilities

| Component | Responsibility |
|---|---|
| **Next.js Browser App** | Renders UI, manages auth state in React Context, routes operations to HTTP or WebSocket via Apollo split link |
| **Apollo Client** | Query/mutation over HTTP with auth headers; subscriptions over WebSocket with `connectionParams` auth |
| **FastAPI Server** | HTTP server, dependency injection (DB session, context), CORS, lifespan management of background tasks |
| **Strawberry GraphQL** | Schema definition, type coercion, resolver dispatch, WebSocket protocol handling, `connection_params` injection |
| **AppContext** | Lazy, lock-safe user resolution from JWT; shared across concurrent subscriptions on same WebSocket connection |
| **Resolvers** | Business logic; row-level access control; event recording; Redis publish on mutations |
| **redis_client.py** | Short-lived connection per `publish()`; long-lived connection per subscription via `create_pubsub()` |
| **notification_worker.py** | Two background tasks: subscriber bridges Pub/Sub → List queue; worker dequeues and processes jobs |
| **PostgreSQL** | Single source of truth for all persistent data; enforces FK constraints between tables |
| **Redis Pub/Sub** | Ephemeral real-time broadcast; decouples mutation writers from subscription readers |
| **Redis List Queue** | Reliable async job queue; persists jobs until consumed; enables subscriber/worker decoupling |

---

### 3.9 Data Storage Strategy

| Data | Store | Why |
|---|---|---|
| Users, orders, menu items | PostgreSQL | Relational structure, ACID guarantees, durability required |
| Order events (audit log) | PostgreSQL | Must be durable, queryable by time range, append-only |
| Notifications (history) | PostgreSQL | Durable so users see missed notifications on next login |
| Real-time order events | Redis Pub/Sub | Ephemeral broadcast — no persistence needed; microsecond delivery |
| Notification jobs | Redis List | Persists if worker is busy; decouples subscriber speed from worker speed |
| Active subscription state | asyncio generators (in-process) | Inherently ephemeral; cleared on client disconnect |
| Auth tokens | Browser `localStorage` | Stateless JWT — server holds no session table |

---

### 3.10 Security Architecture

```
  ┌──────────────────────────────────────────────────────────────┐
  │                  AUTHENTICATION FLOW                          │
  │                                                              │
  │  REGISTRATION / LOGIN                                        │
  │  ┌────────────────────────────────────────────────────┐     │
  │  │  password ──► bcrypt.hashpw(password[:72], salt)   │     │
  │  │  store password_hash in users table                │     │
  │  │                                                    │     │
  │  │  on login: bcrypt.checkpw(plain, hash)             │     │
  │  │  success → JWT { sub: user_id, exp: now+7days }    │     │
  │  │            signed HS256 with SECRET_KEY            │     │
  │  └───────────────────────────┬────────────────────────┘     │
  │                              │ token returned to browser     │
  │                              ▼                               │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │  Browser stores token in localStorage             │      │
  │  │                                                   │      │
  │  │  HTTP requests:  Authorization: Bearer <token>    │      │
  │  │  WS connections: connectionParams.Authorization   │      │
  │  └───────────────────────────┬───────────────────────┘      │
  │                              │                               │
  │  PER-REQUEST VERIFICATION    │                               │
  │  ┌───────────────────────────▼───────────────────────┐      │
  │  │  AppContext.load_user()                           │      │
  │  │  → decode_token(token) → user_id or None         │      │
  │  │  → SELECT * FROM users WHERE id = user_id        │      │
  │  │  → cache result for this request                 │      │
  │  └───────────────────────────┬───────────────────────┘      │
  │                              │                               │
  │  RESOLVER ENFORCEMENT        │                               │
  │  ┌───────────────────────────▼───────────────────────┐      │
  │  │  require_auth()  → raises if user is None         │      │
  │  │  require_admin() → raises if role != ADMIN        │      │
  │  │  WHERE user_id=? → row-level isolation for users  │      │
  │  └───────────────────────────────────────────────────┘      │
  │                                                              │
  │  FRONTEND ENFORCEMENT                                        │
  │  ┌────────────────────────────────────────────────────┐     │
  │  │  AuthGuard     → redirect if not authenticated     │     │
  │  │  AuthGuard adminOnly → redirect if not admin       │     │
  │  │  nav item show → hide links for wrong role         │     │
  │  └────────────────────────────────────────────────────┘     │
  └──────────────────────────────────────────────────────────────┘
```

---

### 3.11 Role-Based Access Model

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                      RBAC MATRIX                                 │
  │                                                                  │
  │  Operation                        USER        ADMIN             │
  │  ─────────────────────────────────────────────────────          │
  │  Register / Login                  ✓            ✓               │
  │  View own orders                   ✓            ✓ (all orders)  │
  │  Place order                       ✓            ✗ (UI hidden)   │
  │  Cancel own order                  ✓            ✗               │
  │  Change any order status           ✗            ✓               │
  │  View menu items                   ✓            ✓               │
  │  View order event history          ✗            ✓               │
  │  Receive NEW_ORDER notification    ✗            ✓               │
  │  Receive ORDER_CANCELLED notif     ✗            ✓ (if user cancels)
  │  Receive ORDER_COMPLETED notif     ✓ (own only) ✗               │
  │  Access /live-orders               ✗            ✓               │
  │  Access /order-history             ✗            ✓               │
  │                                                                  │
  │  ENFORCEMENT LAYERS (independent — defence in depth):           │
  │                                                                  │
  │  Layer 1: Backend resolver                                       │
  │  require_auth()  → rejects unauthenticated calls                │
  │  require_admin() → rejects non-admin calls                      │
  │                                                                  │
  │  Layer 2: Backend data filter                                    │
  │  SELECT ... WHERE user_id = current_user.id  (for non-admins)   │
  │                                                                  │
  │  Layer 3: Frontend guard                                         │
  │  <AuthGuard adminOnly> → redirects non-admins to /              │
  │  navItem.show = isAdmin → hides links for wrong role            │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

### 3.12 Scalability Considerations

```
  CURRENT (single process)                SCALED (horizontal)
  ─────────────────────────               ──────────────────────────────────

  Browser ──► FastAPI (1)                 Browser ──► Load Balancer
              │                                          │
              ├── PostgreSQL (1)                ┌────────┴────────┐
              └── Redis (1)                     │                 │
                                           FastAPI (1)       FastAPI (2)
  asyncio handles all I/O                      │                 │
  concurrently on one loop                     └────┬────────────┘
                                                    │
                                             Redis (shared bus)
                                             Pub/Sub and LPUSH/BRPOP
                                             work across multiple producers
                                             and consumers without double-delivery
                                                    │
                                             PostgreSQL + PgBouncer
                                             (connection pooler needed
                                              since each asyncpg session
                                              opens a real connection)

  Sticky WebSocket sessions NOT required:
  Subscription state lives in Redis channels, not in-process memory.
  Any FastAPI instance can serve any user's subscription.

  Notification worker can run as a separate process:
  BRPOP is atomic — multiple workers would not double-process jobs.
  Job order across workers is not guaranteed.
```

---

### 3.13 Deployment Topology

```
  DEVELOPMENT
  ┌──────────────────────────────────────────────────┐
  │  localhost:3000   Next.js (npm run dev)           │
  │  localhost:4000   FastAPI + Uvicorn               │
  │  localhost:5432   PostgreSQL                      │
  │  localhost:6379   Redis                           │
  └──────────────────────────────────────────────────┘

  PRODUCTION (recommended)
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  ┌──────────────┐                                │
  │  │  CDN/Vercel  │  Next.js (static + SSR)        │
  │  └──────┬───────┘                                │
  │         │  HTTPS                                 │
  │  ┌──────▼───────────────────────────────────┐   │
  │  │  nginx (port 443)                        │   │
  │  │  TLS termination                         │   │
  │  │  HTTP/2                                  │   │
  │  │  WebSocket upgrade pass-through          │   │
  │  │        │                                 │   │
  │  │  ┌─────▼─────────────────────────────┐  │   │
  │  │  │  FastAPI + Uvicorn (port 8000)    │  │   │
  │  │  │  uvicorn main:app --workers 4     │  │   │
  │  │  └─────┬───────────────────┬─────────┘  │   │
  │  └────────┼───────────────────┼────────────┘   │
  │           │                   │                 │
  │  ┌────────▼──────┐  ┌─────────▼──────────────┐ │
  │  │  PostgreSQL   │  │  Redis                  │ │
  │  │  (RDS /       │  │  (ElastiCache / Upstash)│ │
  │  │   Supabase)   │  │                         │ │
  │  └───────────────┘  └─────────────────────────┘ │
  │                                                  │
  │  ENV vars:                                       │
  │    DATABASE_URL          REDIS_HOST              │
  │    SECRET_KEY            REDIS_PORT              │
  │    NEXT_PUBLIC_GRAPHQL_ENDPOINT                  │
  │    NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT               │
  └──────────────────────────────────────────────────┘
```

---

## 4. Low-Level Design (LLD)

### 4.1 Database Schema — Entity Relationship Diagram

```
┌──────────────────────┐
│       users          │
├──────────────────────┤
│ id          PK  STR  │◄────────────────────────────┐
│ name             STR │                             │
│ email       UQ  STR  │                             │
│ password_hash    STR │                             │
│ role             STR │ "USER" | "ADMIN"            │
└──────────┬───────────┘                             │
           │ 1                                       │
           │                                         │
           │ N                                       │
┌──────────▼───────────┐                             │
│       orders         │                             │
├──────────────────────┤                             │
│ id          PK  STR  │◄───────────┐                │
│ user_id     FK  STR  │────────────┼──────────────► │ users.id (nullable)
│ customer_name    STR │            │                │
│ product          STR │            │                │
│ quantity         INT │            │                │
│ price           REAL │            │                │
│ status           STR │ enum       │                │
│ type             STR │ enum       │                │
│ created_at       STR │ ISO-8601   │                │
└──────────────────────┘            │                │
                                    │                │
           ┌────────────────────────┘                │
           │ 1:N (one order → many events)           │
┌──────────▼───────────┐                             │
│    order_events      │                             │
├──────────────────────┤                             │
│ id          PK  STR  │                             │
│ order_id    FK  STR  │────────────────────► orders.id
│ event_type       STR │ "ORDER_PLACED"              │
│                      │ "STATUS_CHANGED"            │
│ old_status  NUL  STR │ null for ORDER_PLACED       │
│ new_status       STR │                             │
│ triggered_by_id NUL STR│──────────────────────────► users.id (nullable)
│ triggered_by_name STR│ denormalised copy           │
│ triggered_by_role STR│ denormalised copy           │
│ timestamp        STR │ ISO-8601 UTC                │
└──────────────────────┘                             │
                                                     │
┌──────────────────────┐                             │
│    notifications     │                             │
├──────────────────────┤                             │
│ id          PK  STR  │                             │
│ recipient_id FK STR  │────────────────────────────►│ users.id
│ type             STR │ "NEW_ORDER"                 │
│                      │ "ORDER_CANCELLED"           │
│                      │ "ORDER_COMPLETED"           │
│ title            STR │                             │
│ message          STR │                             │
│ order_id    NUL  STR │ soft reference to orders    │
│ read            BOOL │ default False               │
│ created_at       STR │ ISO-8601 UTC                │
└──────────────────────┘                             │
                                                     │
┌──────────────────────┐                             │
│     menu_items       │                             │
├──────────────────────┤                             │
│ id          PK  STR  │  (no FK — standalone table) │
│ name             STR │                             │
│ description      STR │ nullable                    │
│ rate            REAL │                             │
│ category         STR │                             │
│ available       BOOL │ default True                │
└──────────────────────┘
```

**Design notes:**
- All primary keys are UUID strings generated in application code, not auto-increment integers. This makes IDs safe to share publicly and portable across environments.
- `order_id` on `notifications` is a soft reference (no FK constraint) to avoid cascade complexity — notifications can outlive a deleted order.
- `triggered_by_*` fields on `order_events` are denormalised. Storing a copy at event time preserves audit accuracy even if the user record changes later.
- All timestamps are stored as ISO-8601 strings rather than `TIMESTAMP WITH TIME ZONE` columns, keeping the schema portable and the values directly serialisable to JSON.

---

### 4.2 Order Status State Machine

```
                    ┌─────────┐
         create_order│         │
      ───────────────►  PENDING │
                    └────┬────┘
                         │ admin accepts
                         ▼
                    ┌──────────┐
                    │ ACCEPTED │
                    └────┬─────┘
                         │ admin starts processing
                         ▼
                    ┌────────────┐
                    │ PROCESSING │
                    └─────┬──────┘
                          │ admin marks ready
                          ▼
                    ┌──────────────────┐
                    │ READY_FOR_PICKUP │
                    └────────┬─────────┘
                             │ admin completes
                             ▼
                        ┌──────────┐
                        │COMPLETED │  (terminal — no further transitions)
                        └──────────┘

From any non-terminal status:
         ─────────────────────────────► CANCELLED  (terminal)
         (by user via cancel button, or admin via status dropdown)
```

**Transition rules enforced in code:**
- `create_order` always sets status to `PENDING` — no other value is accepted from the client.
- `update_order_status` allows any transition (no server-side guard on valid next states) — the admin UI dropdown is the enforcing mechanism.
- `cancellable()` helper on the frontend prevents the cancel button from appearing on `COMPLETED` or `CANCELLED` orders.
- Every transition writes an `OrderEventModel` row with the old and new status.

---

### 4.3 GraphQL API Contract

#### Queries

```graphql
type Query {
  # Auth: any logged-in user
  me: User!

  # Auth: user sees own orders; admin sees all
  orders: [Order!]!
  ordersByStatus(status: OrderStatus!): [Order!]!
  ordersByType(type: OrderType!): [Order!]!
  ordersByOrderId(orderId: ID!): Order

  # Auth: any logged-in user
  listOrderItems: [MenuItem!]!

  # Auth: admin only
  orderHistory(orderId: ID!): OrderHistory!
  allOrdersWithEvents: [Order!]!

  # Auth: any logged-in user (own notifications only)
  myNotifications: [Notification!]!
}
```

#### Mutations

```graphql
type Mutation {
  # Public
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!

  # Auth: any logged-in user
  createOrder(input: CreateOrderInput!): Order!
  markNotificationRead(id: ID!): Boolean!
  markAllNotificationsRead: Boolean!

  # Auth: user can cancel own orders; admin can change any status
  updateOrderStatus(id: ID!, status: OrderStatus!): Order!
}
```

#### Subscriptions

```graphql
type Subscription {
  # Auth: user receives own orders; admin receives all
  orderCreated: Order!

  # Auth: user receives own; admin receives all; optional filter by orderId
  orderStatusUpdated(orderId: ID): Order!

  # Auth: user receives own notifications only (channel: NOTIFICATION:{user.id})
  notificationReceived: Notification!
}
```

#### Input Types

```graphql
input RegisterInput {
  name: String!
  email: String!
  password: String!
  role: UserRole!      # USER | ADMIN
}

input LoginInput {
  email: String!
  password: String!
}

input CreateOrderInput {
  product: String!
  quantity: Int!
  price: Float!
  type: OrderType!     # NEW | SELL
}
```

#### Scalar and Enum Types

```graphql
enum OrderStatus  { PENDING ACCEPTED PROCESSING READY_FOR_PICKUP COMPLETED CANCELLED }
enum OrderType    { NEW SELL }
enum UserRole     { USER ADMIN }
enum OrderEventType { ORDER_PLACED STATUS_CHANGED }
enum NotificationType { NEW_ORDER ORDER_CANCELLED ORDER_COMPLETED }
```

---

### 4.4 Redis Channel and Queue Design

#### Pub/Sub Channels

| Channel name | Published by | Subscribed by | Message format |
|---|---|---|---|
| `ORDER_CREATED` | `create_order` mutation | `order_created` subscription resolver; notification subscriber | Serialised `Order` dict |
| `ORDER_STATUS_UPDATED` | `update_order_status` mutation | `order_status_updated` subscription resolver; notification subscriber | Serialised `Order` dict + `triggered_by_role` |
| `NOTIFICATION:{user_id}` | Notification worker `_process_job` | `notification_received` subscription resolver (per-user) | Serialised `Notification` dict |

#### ORDER_CREATED message schema
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "customer_name": "string",
  "product": "string",
  "quantity": 1,
  "price": 14.99,
  "status": "PENDING",
  "type": "NEW",
  "created_at": "2026-05-10T12:00:00+00:00"
}
```

#### ORDER_STATUS_UPDATED message schema
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "customer_name": "string",
  "product": "string",
  "quantity": 1,
  "price": 14.99,
  "status": "COMPLETED",
  "type": "NEW",
  "created_at": "2026-05-10T12:00:00+00:00",
  "triggered_by_role": "ADMIN"    ← extra field for notification suppression
}
```

#### NOTIFICATION:{user_id} message schema
```json
{
  "id": "uuid",
  "recipient_id": "uuid",
  "type": "ORDER_COMPLETED",
  "title": "Your order is ready!",
  "message": "Your order for Chicken Biryani has been completed.",
  "order_id": "uuid",
  "read": false,
  "created_at": "2026-05-10T12:05:30+00:00"
}
```

#### Job Queue

| Key | Type | Operations | Purpose |
|---|---|---|---|
| `patiala_house:notifications:queue` | Redis List | `LPUSH` (enqueue) / `BRPOP` (dequeue) | Reliable async notification job queue |

#### Job payload schema
```json
{
  "id": "uuid",
  "name": "new_order | order_cancelled | order_completed",
  "data": {
    "type": "NEW_ORDER | ORDER_CANCELLED | ORDER_COMPLETED",
    "order_id": "uuid",
    "customer_name": "string",
    "product": "string",
    "user_id": "uuid",
    "triggered_by_role": "ADMIN | USER"   ← only present in ORDER_CANCELLED jobs
  }
}
```

---

### 4.5 AppContext Class Design

```
┌─────────────────────────────────────────────────────────┐
│  BaseContext  (strawberry.fastapi.BaseContext)            │
│                                                          │
│  request: Optional[Union[Request, WebSocket]]  ← set    │
│  websocket: Optional[WebSocket]                  by      │
│  background_tasks: Optional[BackgroundTasks]   Strawberry│
│  response: Optional[Response]                            │
│  connection_params: Optional[dict]             ← set     │
│                                                  from    │
│                                                connection_init
└──────────────────────────┬──────────────────────────────┘
                           │ inherits
┌──────────────────────────▼──────────────────────────────┐
│  AppContext                                              │
│                                                          │
│  Fields:                                                 │
│    db: AsyncSession           ← injected via Depends     │
│    current_user: UserModel?   ← resolved lazily          │
│    _user_loaded: bool         ← cache flag               │
│    _load_lock: asyncio.Lock   ← prevents race condition  │
│                                                          │
│  Methods:                                                │
│    async load_user() → UserModel?                        │
│      1. fast path: _user_loaded → return current_user    │
│      2. acquire _load_lock                               │
│      3. re-check _user_loaded (double-checked locking)   │
│      4. extract token from:                              │
│         a. conn.headers["Authorization"] (HTTP)          │
│         b. conn.query_params["token"] (legacy WS)        │
│         c. connection_params["Authorization"] (WS)       │
│      5. decode_token(token) → user_id                    │
│      6. db.execute(SELECT * FROM users WHERE id=user_id) │
│      7. set _user_loaded = True                          │
│      8. return current_user                              │
│                                                          │
│    get(key, default) → supports info.context["db"]       │
│    __getitem__(key)  → supports info.context["db"]       │
└─────────────────────────────────────────────────────────┘
```

**Why `asyncio.Lock` is required:** Strawberry creates one `AppContext` per WebSocket connection and reuses it for all subscription operations on that connection. When a page mounts multiple subscriptions simultaneously (e.g. `orderCreated` + `notificationReceived`), both coroutines call `load_user()` concurrently. Without the lock, the second coroutine would read `_user_loaded=True` (set before the DB query) but `current_user=None` (DB not finished), causing a false authentication failure.

---

### 4.6 Notification Worker Module Design

```
notification_worker.py
│
├── _QUEUE_KEY: str = "patiala_house:notifications:queue"
│
├── class _Job
│   ├── name: str
│   ├── data: dict
│   └── id: str
│
├── class _Queue
│   └── async add(name, data) → None
│       Opens short-lived Redis connection
│       LPUSH json({id, name, data})
│       Closes connection
│
├── notification_queue: _Queue  (module singleton)
│
├── async _process_job(job, _token) → None
│   ├── Reads job.data["type"]
│   ├── Suppression: ORDER_CANCELLED + triggered_by_role==ADMIN → return
│   ├── Opens AsyncSessionLocal() context
│   ├── Opens Redis connection
│   ├── Branch NEW_ORDER / ORDER_CANCELLED:
│   │   ├── SELECT all ADMIN users
│   │   ├── For each admin:
│   │   │   ├── INSERT NotificationModel
│   │   │   ├── db.flush()
│   │   │   └── r.publish(NOTIFICATION:{admin.id}, ...)
│   │   └── db.commit()
│   └── Branch ORDER_COMPLETED:
│       ├── INSERT NotificationModel for user_id
│       ├── db.flush() + db.commit()
│       └── r.publish(NOTIFICATION:{user_id}, ...)
│
├── async run_subscriber() → None  [background task]
│   ├── Connects to Redis Pub/Sub
│   ├── Subscribes to ORDER_CREATED, ORDER_STATUS_UPDATED
│   └── Loop:
│       ├── ORDER_CREATED → queue.add("new_order", {type: NEW_ORDER, ...})
│       ├── ORDER_STATUS_UPDATED + status==CANCELLED → queue.add("order_cancelled", ...)
│       └── ORDER_STATUS_UPDATED + status==COMPLETED → queue.add("order_completed", ...)
│
└── async run_worker() → None  [background task]
    ├── Connects to Redis
    └── Loop:
        ├── BRPOP _QUEUE_KEY timeout=1
        ├── Parse JSON → _Job
        └── _process_job(job, None)
```

**Isolation guarantee:** Exceptions inside `_process_job` are caught and logged — they never propagate to `run_worker`, so a single bad job does not crash the worker. Exceptions inside the subscriber loop are caught per-message for the same reason.

---

### 4.7 Event Logging Design

```
Event write path (inside mutation transaction):
─────────────────────────────────────────────
create_order():
  db.add(OrderModel)          ← stage order row
  await db.flush()            ← write to DB within transaction (no commit)
  record_event(               ← stage event row (FK now satisfied)
    event_type = ORDER_PLACED
    new_status = PENDING
    old_status = None
  )
  await db.commit()           ← commit both rows atomically

update_order_status():
  old_status = order.status   ← capture before overwrite
  order.status = new_status
  record_event(               ← stage event row (order already exists)
    event_type = STATUS_CHANGED
    new_status = new_status
    old_status = old_status
  )
  await db.commit()           ← commit status change + event atomically

─────────────────────────────────────────────
record_event() helper:
  Creates OrderEventModel with:
    - UUID id
    - order_id (FK)
    - event_type, old_status, new_status
    - triggered_by_{id,name,role} (denormalised actor snapshot)
    - timestamp = datetime.now(UTC).isoformat()
  db.add(event)  ← no commit — caller owns the transaction

─────────────────────────────────────────────
Event read path (order_history query):
  SELECT * FROM orders WHERE id = ?
  SELECT * FROM order_events WHERE order_id = ? ORDER BY timestamp ASC
  Return OrderHistory { order, events }

─────────────────────────────────────────────
Guarantee: event row and order row are always committed together.
If the commit fails, neither is persisted. The audit log is
always consistent with the order state.
```

---

### 4.8 Sequence Diagrams

#### Placing an Order

```
Browser          FastAPI          PostgreSQL       Redis
   │                │                │               │
   │─createOrder───►│                │               │
   │                │─require_auth──►│ (load user)   │
   │                │◄──UserModel────│               │
   │                │─INSERT order──►│               │
   │                │─flush()───────►│               │
   │                │─INSERT event──►│               │
   │                │─commit()──────►│               │
   │                │─publish()─────────────────────►│ ORDER_CREATED
   │◄──Order────────│                │               │
   │                │                │               │
   │                │                │    [notification_worker subscriber]
   │                │                │               │◄─receive message─┤
   │                │                │               │─LPUSH job────────►│ queue
   │                │                │               │
   │                │                │    [notification_worker worker]
   │                │                │               │◄─BRPOP job───────┤
   │                │─INSERT notif──►│               │
   │                │─commit────────►│               │
   │                │─publish()─────────────────────►│ NOTIFICATION:{admin_id}
   │                │                │               │
   │ [admin browser WebSocket subscription]          │
   │◄──notificationReceived────────────────────────────────────────────┤
```

#### WebSocket Subscription Authentication

```
Browser (graphql-ws)         Strawberry            AppContext
   │                              │                    │
   │──WS connect─────────────────►│                    │
   │                              │─get_context()─────►│ AppContext created
   │                              │                    │ _user_loaded=False
   │──connection_init─────────────►│                   │
   │  { Authorization: "Bearer .." }│                  │
   │                              │─context.connection_params = payload
   │◄─connection_ack──────────────│                    │
   │                              │                    │
   │──subscribe (orderCreated)────►│                   │
   │                              │─load_user()───────►│
   │                              │                    │─acquire lock
   │──subscribe (notifReceived)───►│                   │─decode token
   │                              │─load_user()───────►│─DB query
   │                              │                    │─(second caller
   │                              │                    │  waits on lock)
   │                              │                    │─set _user_loaded=True
   │                              │                    │─release lock
   │                              │◄──UserModel────────│
   │                              │◄──UserModel (cached)│
   │                              │  (second caller    │
   │                              │   sees result)     │
```

#### Notification Suppression Decision

```
Worker publishes NOTIFICATION:{user_id}
          │
          ▼
notification_received subscription yields Notification
          │
          ▼
NotificationBell useEffect fires
          │
          ▼
Is suppressed? (suppressPath === pathname)
    │                    │
   YES                   NO
    │                    │
    ▼                    ▼
  return             prepend to state
  (discard)          update badge count
          │
          └── NotificationModel already in PostgreSQL
              Next page load → MY_NOTIFICATIONS fetches it
              Notification appears in dropdown list
```

---

### 4.9 Frontend Module Design

```
lib/
├── apollo-client.ts
│   ├── getToken()                ← reads localStorage
│   ├── httpLink                  ← HttpLink to /graphql
│   ├── authLink                  ← setContext adds Authorization header
│   ├── wsLink                    ← GraphQLWsLink with connectionParams
│   └── link = ApolloLink.split(  ← routes by operation type
│         isSubscription?,          getMainDefinition AST check
│         wsLink,
│         authLink.concat(httpLink)
│       )
│
├── auth-context.tsx
│   ├── State: user, token, initialized
│   ├── useEffect: hydrate from localStorage on mount
│   ├── login(token, user): store + setContext + resetStore
│   ├── logout(): clear + clearStore
│   └── Derived: isAuthenticated, isAdmin
│
└── graphql/
    ├── queries.ts      GET_ALL_ORDERS, MY_NOTIFICATIONS,
    │                   GET_ORDER_HISTORY, GET_ALL_ORDERS_FOR_HISTORY, ...
    ├── mutation.ts     CREATE_ORDER, UPDATE_ORDER_STATUS,
    │                   MARK_NOTIFICATION_READ, ...
    └── subscription.ts ORDER_CREATED_SUBSCRIPTION,
                        ORDER_UPDATED_SUBSCRIPTION,
                        NOTIFICATION_SUBSCRIPTION

components/
├── AuthGuard.tsx
│   ├── Waits for initialized (no redirect before localStorage read)
│   ├── Redirects to /login if not authenticated
│   └── Redirects to / if adminOnly and not admin
│
├── NotificationBell.tsx
│   ├── useQuery MY_NOTIFICATIONS (network-only, on mount)
│   ├── useSubscription NOTIFICATION_SUBSCRIPTION
│   ├── Suppression: SUPPRESS_FOR_ROLE[role] === pathname
│   ├── Deduplication: prev.some(n => n.id === incoming.id)
│   ├── Optimistic markRead
│   └── Outside-click close via mousedown listener
│
└── OrderCard.tsx
    ├── cancellable(status): status !== COMPLETED && !== CANCELLED
    ├── Shows cancel button if onCancel prop provided + cancellable
    └── Shows status dropdown if onStatusChange prop provided + cancellable
```

---

### 4.10 Error Handling Strategy

| Layer | Error type | Handling |
|---|---|---|
| GraphQL resolver | Unauthenticated request | `require_auth` raises `ValueError("Authentication required")` → Strawberry converts to GraphQL error `{ errors: [{ message: "..." }] }` |
| GraphQL resolver | Non-admin accessing admin route | `require_admin` raises `ValueError("Admin access required")` |
| GraphQL resolver | Order not found | `raise ValueError("Order not found")` |
| GraphQL resolver | Duplicate email on register | `raise ValueError("Email already registered")` |
| `load_user()` | Invalid/expired JWT | `decode_token` returns `None` → user stays `None` → `require_auth` raises |
| `load_user()` | DB query failure | Exception propagates → Strawberry converts to GraphQL error |
| Notification subscriber | Bad message payload | Per-message `try/except` → prints error → continues to next message |
| Notification worker | Job processing failure | Per-job `try/except` → prints error → continues to next job (job is NOT requeued — fire and forget) |
| Frontend Apollo | GraphQL error response | `error` object on `useQuery`/`useMutation` hooks; displayed to user or logged |
| Frontend subscription | WebSocket disconnect | `graphql-ws` client auto-reconnects with exponential backoff; `connectionParams` is re-evaluated on reconnect so token is always fresh |
| Frontend auth | 401-equivalent error | `AuthGuard` redirects to `/login` on `isAuthenticated` becoming false |

---

## 5. Backend — Deep Dive

### 5.1 Project Structure

```
food-server-fastapi/
├── main.py                  # FastAPI app, context setup, middleware, lifespan
├── database.py              # SQLAlchemy engine, session factory, init_db
├── models.py                # ORM table definitions (5 tables)
├── auth.py                  # JWT creation/verification, password hashing
├── redis_client.py          # Redis publish and pubsub helpers
├── notification_worker.py   # Notification queue subscriber + worker
├── schema/
│   ├── types.py             # Strawberry GraphQL type definitions
│   └── resolvers.py         # Query, Mutation, Subscription resolvers
├── requirements.txt
└── .env
```

---

### 5.2 Database Layer

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

### 5.3 Models

**File: `models.py`**

Five tables are defined using SQLAlchemy's declarative style.

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

**`OrderEventModel`** — the `order_events` table (append-only event log):
```python
class OrderEventModel(Base):
    __tablename__ = "order_events"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id          = Column(String, ForeignKey("orders.id"), nullable=False)
    event_type        = Column(String, nullable=False)   # "ORDER_PLACED" | "STATUS_CHANGED"
    old_status        = Column(String, nullable=True)    # null for ORDER_PLACED events
    new_status        = Column(String, nullable=False)
    triggered_by_id   = Column(String, ForeignKey("users.id"), nullable=True)
    triggered_by_name = Column(String, nullable=True)
    triggered_by_role = Column(String, nullable=True)
    timestamp         = Column(String, nullable=False)   # ISO 8601 UTC string
```
- Every row is a fact — events are never updated or deleted, only appended.
- `order_id` has a foreign key to `orders.id` enforced at the DB level.
- `triggered_by_*` fields are denormalised copies of the actor's identity at the time of the event. This ensures the audit log stays accurate even if a user is later renamed or deleted.
- `old_status` is `nullable=True` because `ORDER_PLACED` has no prior status.

**`NotificationModel`** — the `notifications` table:
```python
class NotificationModel(Base):
    __tablename__ = "notifications"
    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_id = Column(String, ForeignKey("users.id"), nullable=False)
    type         = Column(String, nullable=False)   # "NEW_ORDER" | "ORDER_CANCELLED" | "ORDER_COMPLETED"
    title        = Column(String, nullable=False)
    message      = Column(String, nullable=False)
    order_id     = Column(String, nullable=True)    # link back to the relevant order
    read         = Column(Boolean, nullable=False, default=False)
    created_at   = Column(String, nullable=False)
```
- `recipient_id` is a foreign key to `users.id` — each notification belongs to exactly one user.
- `read` starts as `False` and is flipped to `True` when the user dismisses or opens the notification.
- Notifications are persisted to the database so the user can see missed notifications when they next open the app.

---

### 5.4 Authentication

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

### 5.5 GraphQL Schema — Types

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

### 5.6 GraphQL Schema — Resolvers

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

### 5.7 Real-Time Subscriptions with Redis

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

### 5.8 Request Context — How Auth Flows into Every Resolver

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

### 5.9 Application Entry Point

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

### 5.10 Event Logging — Order Audit Trail

The event logging system implements the **Event Sourcing** pattern. Instead of only storing the current state of an order, every state transition is recorded as an immutable event row. This creates a complete audit trail showing who did what, when, and in what sequence.

#### Design Principle

The `order_events` table is append-only. Nothing in the application ever `UPDATE`s or `DELETE`s rows from it. Each row answers the question: *"What happened to this order at this moment?"* The current state of an order can always be reconstructed by replaying its events in sequence.

#### Where Events Are Written

Events are written inside the same database transaction as the mutation that causes them. This is enforced by `await db.flush()` followed by `record_event()`:

**`create_order` mutation** (`schema/resolvers.py`):
```python
db.add(new_model)
await db.flush()       # Writes the order row within the transaction so the FK exists
await record_event(
    db, new_model.id,
    event_type=OrderEventType.ORDER_PLACED,
    new_status=OrderStatus.PENDING,
    old_status=None,   # no prior status — this is the first event
    user=user,
)
await db.commit()      # Commits BOTH the order row AND the event row atomically
```

Why `db.flush()` before `record_event()`? `flush()` writes the `OrderModel` row to the database within the open transaction without committing. This ensures the `order_events` row's foreign key (`order_id`) points to a row that already exists in the transaction, preventing a FK violation. Without `flush()`, the order and its first event would hit the DB in the wrong order.

**`update_order_status` mutation** (`schema/resolvers.py`):
```python
old_status = OrderStatus(order_model.status)   # capture before overwrite
order_model.status = status.value
await record_event(
    db, order_model.id,
    event_type=OrderEventType.STATUS_CHANGED,
    new_status=status,
    old_status=old_status,                      # transition: old → new
    user=user,
)
await db.commit()
```

The old status is read from the model before it is overwritten so the transition (e.g. `PENDING → ACCEPTED`) is recorded completely.

#### The `record_event` Helper

```python
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
    # no commit — caller commits the whole transaction together
```

The helper does not commit. It only `db.add(event)`, staging the event in the session. The caller commits everything at once — the order row mutation and the event row are always committed together or not at all.

#### GraphQL Types for Events

In `schema/types.py`:

```python
@strawberry.enum
class OrderEventType(Enum):
    ORDER_PLACED  = "ORDER_PLACED"
    STATUS_CHANGED = "STATUS_CHANGED"

@strawberry.type
class OrderEvent:
    id: strawberry.ID
    order_id: strawberry.ID
    event_type: OrderEventType
    old_status: Optional[OrderStatus]   # null for ORDER_PLACED
    new_status: OrderStatus
    triggered_by_name: Optional[str]
    triggered_by_role: Optional[str]
    timestamp: str

@strawberry.type
class OrderHistory:
    order: Order             # the full order snapshot
    events: List[OrderEvent] # chronological list of all events for this order
```

`OrderHistory` is a wrapper that bundles the order itself with its full event list. This lets the client fetch both in a single query.

#### GraphQL Queries for History

**`order_history`** — fetches all events for a specific order (admin only):
```python
@strawberry.field
async def order_history(self, info: Info, order_id: strawberry.ID) -> OrderHistory:
    await require_admin(info)
    db = info.context["db"]
    order_result = await db.execute(
        select(OrderModel).where(OrderModel.id == str(order_id))
    )
    order_model = order_result.scalar_one_or_none()
    if not order_model:
        raise ValueError("Order not found")
    events_result = await db.execute(
        select(OrderEventModel)
        .where(OrderEventModel.order_id == str(order_id))
        .order_by(OrderEventModel.timestamp)   # chronological order
    )
    events = events_result.scalars().all()
    return OrderHistory(
        order=model_to_order(order_model),
        events=[model_to_order_event(e) for e in events],
    )
```

**`all_orders_with_events`** — returns every order sorted by creation date (admin only), used to populate the left-panel order list on the history browser page:
```python
@strawberry.field
async def all_orders_with_events(self, info: Info) -> List[Order]:
    await require_admin(info)
    db = info.context["db"]
    result = await db.execute(
        select(OrderModel).order_by(OrderModel.created_at.desc())
    )
    return [model_to_order(o) for o in result.scalars().all()]
```

---

### 5.11 Notification System

The notification system is designed around three principles:
1. **Decoupled from the mutation path** — no notification logic runs inside the GraphQL resolvers. A resolver failure can never trigger a duplicate notification; a notification failure can never surface to the HTTP caller.
2. **Queue-backed processing** — notifications are processed asynchronously via a Redis list queue, not in-line with the mutation.
3. **Per-user real-time delivery** — each user has a personal Redis Pub/Sub channel (`NOTIFICATION:{user_id}`) that their active WebSocket subscription listens to.

#### Architecture Overview

```
Mutation (GraphQL resolver)
    │
    │  publishes to existing channel
    ▼
Redis Pub/Sub  ──────────────────────────────────►  Subscriber (run_subscriber)
  ORDER_CREATED                                          │
  ORDER_STATUS_UPDATED                                   │  LPUSH job to Redis list
                                                         ▼
                                                   Redis List Queue
                                                   "patiala_house:notifications:queue"
                                                         │
                                                         │  BRPOP (blocking dequeue)
                                                         ▼
                                                    Worker (run_worker)
                                                         │
                                                         │  writes NotificationModel
                                                         │  to PostgreSQL
                                                         │
                                                         │  publishes to per-user channel
                                                         ▼
                                                   Redis Pub/Sub
                                                   NOTIFICATION:{user_id}
                                                         │
                                                         ▼
                                                   notification_received
                                                   GraphQL subscription
                                                         │
                                                         ▼
                                                   Browser WebSocket
                                                   (NotificationBell updates)
```

#### Queue Implementation

**File: `notification_worker.py`**

Python's `bullmq` library is incompatible with Python 3.8 (it uses the `dict | str` union syntax from PEP 604, which requires Python 3.10+). The queue is therefore implemented directly on Redis primitives, replicating BullMQ's core semantics:

| BullMQ operation | Redis primitive used |
|---|---|
| `queue.add(name, data)` | `LPUSH <queue-key> <json-blob>` |
| Worker dequeue | `BRPOP <queue-key> <timeout>` |

```python
_QUEUE_KEY = "patiala_house:notifications:queue"

class _Queue:
    async def add(self, name: str, data: dict) -> None:
        r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        try:
            payload = json.dumps({
                "id": str(uuid.uuid4()),
                "name": name,
                "data": data,
            })
            await r.lpush(_QUEUE_KEY, payload)   # Push to the LEFT (head) of the list
        finally:
            await r.close()

notification_queue = _Queue()   # Module-level singleton
```

`LPUSH` adds jobs to the head of the list. `BRPOP` removes from the tail (right end). This gives FIFO ordering: first pushed is first processed. The JSON payload mirrors BullMQ's job format (`id`, `name`, `data`) so tests can validate the contract without changing if BullMQ is ever re-adopted.

#### The Subscriber (Producer Side)

`run_subscriber()` is a long-running async task that subscribes to the same Redis Pub/Sub channels that mutations publish to. It acts purely as a bridge — it inspects the event and decides what type of notification job to enqueue.

```python
async def run_subscriber() -> None:
    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("ORDER_CREATED", "ORDER_STATUS_UPDATED")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        data = json.loads(message["data"])
        channel = message["channel"]

        if channel == "ORDER_CREATED":
            await notification_queue.add("new_order", {
                "type": "NEW_ORDER",
                "order_id": data.get("id"),
                "customer_name": data.get("customer_name", ""),
                "product": data.get("product", ""),
                "user_id": data.get("user_id"),
            })

        elif channel == "ORDER_STATUS_UPDATED":
            status = data.get("status", "")

            if status == "CANCELLED":
                await notification_queue.add("order_cancelled", {
                    "type": "ORDER_CANCELLED",
                    "order_id": data.get("id"),
                    "customer_name": data.get("customer_name", ""),
                    "product": data.get("product", ""),
                    "user_id": data.get("user_id"),
                    "triggered_by_role": data.get("triggered_by_role"),  # ADMIN or USER
                })

            elif status == "COMPLETED":
                await notification_queue.add("order_completed", {
                    "type": "ORDER_COMPLETED",
                    "order_id": data.get("id"),
                    "customer_name": data.get("customer_name", ""),
                    "product": data.get("product", ""),
                    "user_id": data.get("user_id"),
                })
```

Key decisions:
- Only `CANCELLED` and `COMPLETED` status changes produce notifications — other transitions (e.g. `PENDING → ACCEPTED`) do not.
- `triggered_by_role` is forwarded in the `ORDER_CANCELLED` job so the worker can suppress admin-triggered cancellations (the admin already knows they cancelled it).
- Exceptions inside this loop are caught and logged per-message — a single bad message does not kill the subscriber.

#### The Worker (Consumer Side)

`run_worker()` is a second long-running async task that processes jobs from the Redis list:

```python
async def run_worker() -> None:
    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    try:
        while True:
            result = await r.brpop(_QUEUE_KEY, timeout=1)
            # brpop blocks up to 1 second then returns None — keeps the loop
            # responsive to CancelledError without busy-spinning.
            if result is None:
                continue
            _, raw = result
            payload = json.loads(raw)
            job = _Job(payload["name"], payload["data"], payload["id"])
            await _process_job(job, None)
    except asyncio.CancelledError:
        pass
    finally:
        await r.close()
```

`BRPOP` with `timeout=1` means the worker sleeps for at most one second if the queue is empty, then wakes up to check `asyncio.CancelledError`. This avoids busy-polling and allows clean shutdown when the server stops.

#### The Job Processor

`_process_job()` contains all the actual notification business logic:

```python
async def _process_job(job: _Job, _token) -> None:
    data = job.data
    job_type = data.get("type", "")

    # Suppression rule: admin-cancelled orders don't need to notify admins
    if job_type == "ORDER_CANCELLED" and data.get("triggered_by_role") == "ADMIN":
        return

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc).isoformat()

        if job_type in ("NEW_ORDER", "ORDER_CANCELLED"):
            # Notify ALL admin users
            result = await db.execute(
                select(UserModel).where(UserModel.role == "ADMIN")
            )
            admins = result.scalars().all()

            for admin in admins:
                notif = NotificationModel(
                    id=str(uuid.uuid4()),
                    recipient_id=admin.id,
                    type=job_type,
                    title="New Order Received" if job_type == "NEW_ORDER" else "Order Cancelled by User",
                    message=...,
                    order_id=data.get("order_id"),
                    read=False,
                    created_at=now,
                )
                db.add(notif)
                await db.flush()  # get the row into the transaction before publishing
                await r.publish(
                    f"NOTIFICATION:{admin.id}",
                    json.dumps(_notif_dict(notif)),
                )
            await db.commit()

        elif job_type == "ORDER_COMPLETED":
            # Notify only the specific user who placed the order
            user_id = data.get("user_id")
            if not user_id:
                return
            notif = NotificationModel(
                id=str(uuid.uuid4()),
                recipient_id=user_id,
                type="ORDER_COMPLETED",
                title="Your order is ready!",
                message=f"Your order for {data.get('product', 'an item')} has been completed.",
                order_id=data.get("order_id"),
                read=False,
                created_at=now,
            )
            db.add(notif)
            await db.flush()
            await db.commit()
            await r.publish(
                f"NOTIFICATION:{user_id}",
                json.dumps(_notif_dict(notif)),
            )
```

**Notification rules:**

| Job type | Recipients | Suppression |
|---|---|---|
| `NEW_ORDER` | All ADMIN users | None |
| `ORDER_CANCELLED` | All ADMIN users | Skipped if `triggered_by_role == "ADMIN"` |
| `ORDER_COMPLETED` | The order's owner (user_id) | None |

`db.flush()` before `r.publish()` ensures the `NotificationModel` row exists in the database before the real-time push is sent. If the client receives the push and immediately queries `myNotifications`, the row will be there.

#### Lifecycle Management

Both tasks are started in the application lifespan and cancelled on shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_menu_items(db)

    from notification_worker import run_subscriber, run_worker
    subscriber_task = asyncio.create_task(run_subscriber())
    worker_task    = asyncio.create_task(run_worker())

    yield  # server is running

    subscriber_task.cancel()
    worker_task.cancel()
    for task in (subscriber_task, worker_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
```

`asyncio.create_task` schedules them concurrently with the server event loop. Both tasks handle `asyncio.CancelledError` to perform clean shutdown (unsubscribing from Redis channels, closing connections).

#### The `notification_received` GraphQL Subscription

The final link in the chain is the GraphQL subscription that pushes notifications to the browser in real time:

```python
@strawberry.subscription
async def notification_received(self, info: Info) -> AsyncGenerator[Notification, None]:
    user = await require_auth(info)
    r, pubsub = await redis_client.create_pubsub()
    channel = f"NOTIFICATION:{user.id}"   # per-user channel — only this user's events
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
```

Each user subscribes to their own personal channel. There is no broadcast — the worker publishes only to the exact `NOTIFICATION:{user_id}` channel for the intended recipient.

#### WebSocket Auth Race Condition Fix

Because a user's page typically starts two subscriptions simultaneously (e.g. `notification_received` and `order_status_updated`), both would call `load_user()` on the same `AppContext` object at nearly the same moment. An asyncio race condition existed: the second coroutine would check `_user_loaded=True` (set before the `await db.execute()`), read `current_user=None` (DB query not yet complete), and return `None` — causing a spurious "Authentication required" error.

The fix uses `asyncio.Lock` with double-checked locking:

```python
class AppContext(BaseContext):
    def __init__(self, db: AsyncSession):
        super().__init__()
        self.db = db
        self.current_user = None
        self._user_loaded = False
        self._load_lock = asyncio.Lock()   # prevents concurrent load_user() races

    async def load_user(self):
        if self._user_loaded:              # fast path: already resolved
            return self.current_user
        async with self._load_lock:        # slow path: only one coroutine enters
            if self._user_loaded:          # re-check inside lock (second caller waits here)
                return self.current_user
            # ... token extraction and DB query ...
            self._user_loaded = True       # set AFTER DB query completes
            return self.current_user
```

The key difference from the original: `_user_loaded = True` is now set at the **end** of the function (after the `await db.execute`), not at the start. Combined with the lock, subsequent concurrent callers queue on the lock and then see `_user_loaded=True` after the first caller has fully resolved the user.

---

## 6. Frontend — Deep Dive

### 6.1 Project Structure

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
│   ├── Navigation.tsx       # Top nav bar with role-based links + NotificationBell
│   ├── AuthGuard.tsx        # Route protection wrapper
│   ├── NotificationBell.tsx # Bell icon, badge counter, dropdown, real-time push
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

### 6.2 Apollo Client Setup

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

### 6.3 Authentication Context

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

### 6.4 Route Protection with AuthGuard

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

### 6.5 Pages and Their Responsibilities

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
| Order History | `/order-history` | Admin only | Event sourcing audit browser. Left panel: all orders. Right panel: event timeline for selected order. |

---

### 6.6 Real-Time Updates on the Frontend

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

### 6.7 Role-Based UI

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

### 6.8 Notification Bell Component

**File: `components/NotificationBell.tsx`**

The `NotificationBell` is mounted in the `Navigation` bar for every authenticated user. It combines an initial HTTP query (to load missed notifications on page load) with a real-time GraphQL subscription (to receive new notifications as they arrive).

#### Initial Load

```typescript
const { data: initialData } = useQuery<MyNotificationsData>(MY_NOTIFICATIONS, {
  skip: !isAuthenticated,
  fetchPolicy: 'network-only',   // always go to server, never serve from cache
})

useEffect(() => {
  if (initialData?.myNotifications) {
    setNotifications(initialData.myNotifications)
  }
}, [initialData])
```

`network-only` ensures the bell always shows the correct unread count from the database when the page loads, not a stale cached count from a previous visit.

#### Real-Time Push via Subscription

```typescript
const { data: subData } = useSubscription<NotificationSubData>(NOTIFICATION_SUBSCRIPTION, {
  skip: !isAuthenticated,
})

useEffect(() => {
  if (!subData?.notificationReceived) return
  const incoming = subData.notificationReceived
  if (suppressed) return   // don't surface in bell if user is on the relevant page
  setNotifications((prev) => {
    if (prev.some((n) => n.id === incoming.id)) return prev   // deduplication
    return [incoming, ...prev]
  })
}, [subData, suppressed])
```

The deduplication check (`prev.some(n => n.id === incoming.id)`) prevents a notification from appearing twice if the query and the subscription deliver the same item.

#### Suppression Logic

The bell deliberately hides badge increments and incoming push events when the user is already viewing the page that contains the relevant information:

```typescript
const SUPPRESS_FOR_ROLE: Record<string, string> = {
  ADMIN: '/live-orders',   // admin can see new/cancelled orders directly on this page
  USER:  '/your-orders',   // user can see their order status directly on this page
}

const suppressPath = user ? SUPPRESS_FOR_ROLE[user.role] : undefined
const suppressed   = !!suppressPath && pathname === suppressPath

const unread = suppressed ? 0 : notifications.filter((n) => !n.read).length
```

When `suppressed` is `true`:
- The incoming subscription event is discarded from React state (line: `if (suppressed) return`).
- The unread count is forced to `0` so the badge disappears.
- The notification IS still written to the database by the worker — when the user navigates away from the suppression page and the bell re-renders, the `MY_NOTIFICATIONS` refetch will pick it up.

#### Mark Read

```typescript
const handleMarkRead = async (id: string) => {
  // Optimistic update: mark read in local state instantly
  setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  // Persist to DB
  await markRead({ variables: { id } })
}
```

The optimistic update makes the blue dot disappear immediately without waiting for the network round-trip. If the mutation fails, the state is slightly out of sync, but on next page load `fetchPolicy: 'network-only'` will restore the correct state.

---

### 6.9 Order History Page

**File: `app/order-history/page.tsx`**

This is an admin-only page (`<AuthGuard adminOnly>`) that provides a visual audit trail for any order.

#### Layout

The page is split into two panels:

- **Left panel (2/5 width):** Searchable list of all orders, populated by `GET_ALL_ORDERS_FOR_HISTORY` query (`allOrdersWithEvents`). Clicking an order selects it.
- **Right panel (3/5 width):** Event timeline for the selected order, populated by `GET_ORDER_HISTORY` lazy query (`orderHistory`).

#### Fetching Data

```typescript
// Left panel — load all orders upfront
const { data: allOrdersData, loading: loadingOrders } =
  useQuery(GET_ALL_ORDERS_FOR_HISTORY)

// Right panel — lazy: only fires when an order is selected
const [fetchHistory, { data: historyData, loading: loadingHistory }] =
  useLazyQuery(GET_ORDER_HISTORY)

const handleSelectOrder = (orderId: string) => {
  setSelectedOrderId(orderId)
  fetchHistory({ variables: { orderId } })
}
```

`useLazyQuery` is used for the right panel because the query depends on user selection — it should not fire until an order is clicked. Every click calls `fetchHistory` with the new order ID, replacing the previous result.

#### The Event Timeline

Each `OrderEvent` is rendered as a timeline item with:

- **Icon** — `+` for `ORDER_PLACED`, `→` for `STATUS_CHANGED`, `✕` for cancellations, `✓` for completions.
- **Status badge** — coloured label showing the `new_status` value.
- **Triggered-by** — actor's name and a role badge (`ADMIN` in red, `USER` in blue).
- **Timestamp** — formatted local time.
- **Elapsed time** — time between this event and the next one (e.g. "3m 24s later"), helping the admin understand how long each stage took.

```typescript
function timeDiff(from: string, to: string): string {
  const diffMs = new Date(to).getTime() - new Date(from).getTime()
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return `${secs}s later`
  const mins = Math.floor(secs / 60)
  const rem  = secs % 60
  return rem > 0 ? `${mins}m ${rem}s later` : `${mins}m later`
}
```

The elapsed time is calculated by comparing adjacent event timestamps in the sorted list returned by the backend (`ORDER BY timestamp`).

#### Search and Filter

The left panel filters orders client-side as the admin types:

```typescript
const filtered = (allOrdersData?.allOrdersWithEvents ?? []).filter((o: Order) => {
  const q = search.toLowerCase()
  return (
    o.customerName.toLowerCase().includes(q) ||
    o.product.toLowerCase().includes(q) ||
    o.id.toLowerCase().includes(q)
  )
})
```

All order data is already fetched — the filter just reduces what's displayed. This avoids a server round-trip on every keystroke.

---

## 7. End-to-End Feature Walkthroughs

### 7.1 User Registration and Login

1. User fills the register form → frontend calls `register` mutation with `{ name, email, password, role }`.
2. Backend checks that the email isn't already taken.
3. Password is hashed with bcrypt and a new `UserModel` row is inserted.
4. A JWT is created with `sub = user.id` and returned in `AuthPayload`.
5. Frontend's `login(token, user)` stores both in `localStorage`, updates React state, resets Apollo cache.
6. `AuthProvider.isAuthenticated` becomes `true`, `isAdmin` is set based on `user.role`.
7. All future HTTP requests carry `Authorization: Bearer <token>`.
8. WebSocket subscriptions connect with `?token=<jwt>` in the URL.

### 7.2 Placing an Order

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

### 7.3 Admin Updates Order Status — User Sees It Live

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

### 7.4 Cancelling an Order

1. User sees a "Cancel Order" button on any active order (status not `COMPLETED` or `CANCELLED`).
2. Clicking it calls `updateOrderStatus({ id, status: "CANCELLED" })`.
3. Backend updates the DB and publishes to `ORDER_STATUS_UPDATED`.
4. The subscription delivers the `CANCELLED` status back to the same user.
5. `OrderTimeline` switches to showing the red "Order Cancelled" banner.
6. The cancel button disappears (the `cancellable()` check in `OrderCard` returns `false`).

### 7.5 Notification Delivery — End to End

This walkthrough traces an ORDER_COMPLETED notification from the admin's click to the user's bell icon.

1. Admin is on `/live-orders` and changes an order's status to `COMPLETED` via the dropdown.
2. `updateOrderStatus` mutation fires → backend updates `order_model.status`, calls `record_event()`, commits.
3. `update_order_status` resolver publishes to Redis:
   ```python
   publish_data = order_to_dict(order)
   publish_data["triggered_by_role"] = user.role   # "ADMIN"
   await redis_client.publish("ORDER_STATUS_UPDATED", publish_data)
   ```
4. **Subscriber** (`run_subscriber`) receives the message from `ORDER_STATUS_UPDATED`:
   - Sees `status == "COMPLETED"`.
   - Calls `notification_queue.add("order_completed", { type: "ORDER_COMPLETED", user_id: "...", ... })`.
   - `LPUSH` writes the JSON job to the Redis list `patiala_house:notifications:queue`.
5. **Worker** (`run_worker`) receives the job via `BRPOP`:
   - Passes it to `_process_job()`.
   - `job_type == "ORDER_COMPLETED"` branch: creates `NotificationModel` row, `flush()`, `commit()`.
   - Publishes JSON to `NOTIFICATION:{user_id}`.
6. The user's browser has an active `notification_received` WebSocket subscription listening on `NOTIFICATION:{user.id}`.
   - `pubsub.listen()` yields the Redis message.
   - The resolver `yield`s the `Notification` object to the WebSocket.
7. Apollo Client receives the subscription event in `NotificationBell.tsx`.
   - `useEffect` on `subData` fires.
   - Checks `suppressed` — if the user is NOT on `/your-orders`, proceeds.
   - Prepends the notification to local state.
   - The bell icon gains a red badge with count `1`.

**Suppression case:** If the user IS on `/your-orders` when the order completes, `suppressed = true`. The notification is not added to local state and the badge stays at 0. The `NotificationModel` row was still written to the DB by the worker. Next time the user loads any page, `MY_NOTIFICATIONS` fetches it and the unread dot appears in the dropdown list.

---

### 7.6 Admin Inspects Order History

1. Admin navigates to `/order-history`. `AuthGuard adminOnly` confirms admin role.
2. `GET_ALL_ORDERS_FOR_HISTORY` query fires → returns all orders sorted by `created_at DESC`.
3. Left panel renders a list of order cards with customer name, product, status badge.
4. Admin types "chicken" in the search box → client-side filter narrows the list instantly.
5. Admin clicks an order. `handleSelectOrder(orderId)` fires:
   - Sets `selectedOrderId` in local state (highlights the row).
   - Calls `fetchHistory({ variables: { orderId } })`.
6. `GET_ORDER_HISTORY` query (`orderHistory`) fetches:
   ```graphql
   query GetOrderHistory($orderId: ID!) {
     orderHistory(orderId: $orderId) {
       order { id customerName product status ... }
       events {
         id eventType oldStatus newStatus
         triggeredByName triggeredByRole timestamp
       }
     }
   }
   ```
7. Right panel renders the event timeline in chronological order.
8. For each adjacent pair of events, `timeDiff(event[i].timestamp, event[i+1].timestamp)` shows the elapsed time between steps — e.g. "Order placed → Accepted (2m 14s later) → Processing (8m 51s later) → Completed (4m 3s later)".

---

## 8. Data Flow Diagram

### Core Order Flow

```
BROWSER (Next.js)
│
│  HTTP (queries & mutations)
│  ────────────────────────────────────────────────────────────────►
│                                                                   │
│                                                           FastAPI + Strawberry
│                                                           /graphql endpoint
│                                                                   │
│  WebSocket (subscriptions)                                        │
│  ◄────────────────────────────────────────────────────────────────
│  connectionParams: { Authorization: "Bearer <jwt>" }              │
│                                                                   │
│                                                              ┌────┴────┐
│                                                              │AppContext│
│                                                              │load_user│ ← asyncio.Lock
│                                                              └────┬────┘
│                                                                   │
│                                                         ┌─────────┴──────────┐
│                                                         │                    │
│                                                   PostgreSQL              Redis
│                                                   (users, orders,    Pub/Sub channels:
│                                                    menu_items,        ORDER_CREATED
│                                                    order_events,      ORDER_STATUS_UPDATED
│                                                    notifications)     NOTIFICATION:{uid}
│                                                                            │
│                                                                    ┌───────┴────────┐
│                                                                    │ notification_  │
│                                                                    │ worker         │
│                                                                    │                │
│                                                                    │ subscriber ◄───┤ ORDER_CREATED
│                                                                    │   │            │ ORDER_STATUS_UPDATED
│                                                                    │   │ LPUSH      │
│                                                                    │   ▼            │
│                                                                    │ Redis List     │
│                                                                    │ Queue          │
│                                                                    │   │ BRPOP      │
│                                                                    │   ▼            │
│                                                                    │ worker         │
│                                                                    │   │ write DB   │
│                                                                    │   │ publish ───┤► NOTIFICATION:{uid}
│                                                                    └───────────────┘
│
│  ◄─────────────────────── WebSocket event ─────────────────────────
│  Apollo Client receives subscription data
│  useEffect updates React state / NotificationBell badge
```

### Event Logging Flow

```
User action (place order or change status)
        │
        ▼
GraphQL Mutation resolver
        │
        ├── db.add(OrderModel or update status)
        ├── await db.flush()          ← ensures FK row exists in transaction
        ├── record_event(...)         ← db.add(OrderEventModel)
        └── await db.commit()         ← both rows committed atomically
                                              │
                                              ▼
                                        PostgreSQL
                                        order_events table
                                        (append-only audit log)
                                              │
                         ┌────────────────────┘
                         │  Admin queries order_history(orderId)
                         ▼
                   GraphQL: orderHistory query
                         │
                         ▼
                   /order-history page
                   Event timeline rendered
                   with elapsed times between steps
```

**Key Principles:**

- **Mutations write to PostgreSQL *and* publish to Redis.** Subscriptions read from Redis, not the database. Fan-out is handled entirely by Redis — the database is never polled for real-time updates.
- **Notifications are fully decoupled.** The mutation path only publishes to the channels it already uses. The notification subscriber picks these up independently. A notification failure never affects the HTTP response to the user.
- **Event rows are immutable.** The `order_events` table only receives `INSERT` operations. The complete history of any order can be reconstructed at any time by reading its events in chronological order.
- **Auth race conditions are prevented by `asyncio.Lock`.** Multiple concurrent subscriptions on the same WebSocket connection share one `AppContext`. The lock ensures `load_user()` executes only once and all callers wait for the resolved user rather than reading a partially-initialised state.
