# Your Orders Page - Real-time Order Tracking Implementation

## Overview

The Your Orders page has been updated to fetch order details using the `ordersByOrderId` query when an order is clicked, and to update the order status timeline in real-time using GraphQL subscriptions.

## Changes Made

### 1. GraphQL Queries (`lib/graphql/queries.ts`)

Added a new query `GET_ORDERS_BY_ORDER_ID` to fetch order details by orderId:

```graphql
query GetOrdersByOrderId($orderId: ID!) {
  ordersByOrderId(orderId: $orderId) {
    id
    customerName
    product
    quantity
    price
    status
    type
    createdAt
  }
}
```

### 2. Your Orders Page (`app/your-orders/page.tsx`)

#### Key Features Implemented:

1. **Initial Order Loading**

   - Uses `GET_ALL_ORDERS` query to fetch all orders for the sidebar list
   - Displays orders in a card-based sidebar with status badges

2. **Order Selection & Detail Fetching**

   - When a user clicks on an order, the `GET_ORDERS_BY_ORDER_ID` lazy query is triggered
   - Fetches complete order details using the orderId
   - Shows loading spinner while fetching order details

3. **Real-time Updates via Subscription**

   - Uses `ORDER_UPDATED_SUBSCRIPTION` with `subscribeToMore` pattern
   - Subscribes only when an order is selected (using `skip` parameter)
   - Updates both:
     - The selected order details in the timeline
     - The order in the sidebar list

4. **State Management**
   - `orders`: List of all orders for the sidebar
   - `selectedOrderId`: Currently selected order ID
   - `selectedOrderDetails`: Full details of the selected order from the query
   - `displayOrder`: Computed value that shows either the fetched details or fallback

#### Implementation Flow:

```
User clicks order
    ↓
setSelectedOrderId(orderId)
    ↓
useEffect triggers getOrderDetails({ orderId })
    ↓
Query fetches order data
    ↓
setSelectedOrderDetails(data)
    ↓
OrderTimeline displays the order
    ↓
Subscription listens for updates
    ↓
Real-time status changes update the timeline
```

#### GraphQL Operations Used:

1. **Query**: `GET_ALL_ORDERS` - Initial load of all orders
2. **Lazy Query**: `GET_ORDERS_BY_ORDER_ID` - Fetch specific order on click
3. **Subscription**: `ORDER_UPDATED_SUBSCRIPTION` - Real-time updates

## Usage

### When an order is clicked:

1. The order details are fetched using the `ordersByOrderId` query
2. The timeline component displays the order status
3. A subscription is established for that specific order
4. Any status updates to the order are reflected in real-time in the timeline

### Real-time Updates:

- When the order status changes on the backend
- The subscription receives the updated order
- The timeline is automatically updated
- The sidebar list also reflects the new status

## Benefits

1. **Efficient Data Fetching**: Only fetches detailed data when needed
2. **Real-time Experience**: Users see status updates immediately
3. **Optimized Subscriptions**: Only subscribes to the selected order
4. **Better UX**: Loading states and error handling included
5. **Scalable**: Works efficiently with large order lists

## Testing

To test the real-time updates:

1. Navigate to the Your Orders page
2. Click on an order to view its timeline
3. Update the order status from another client/admin panel
4. Observe the timeline updating in real-time without page refresh

## Dependencies

- `@apollo/client` - GraphQL client with subscription support
- `OrderTimeline` component - Displays order status progression
- WebSocket connection configured in `apollo-client.ts`
