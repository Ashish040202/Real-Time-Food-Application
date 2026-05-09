# Order Timeline Component

## Overview

The Order Timeline component provides a visual representation of an order's progress through various stages, from placement to delivery.

## Components Created

### 1. OrderTimeline Component (`components/OrderTimeline.tsx`)

A timeline component that displays the order status progression with the following stages:

- **Order Placed** - Initial order placement
- **Order Accepted** - Restaurant accepts the order
- **Food is Preparing** - Order is being prepared
- **Ready for Pickup** - Order is ready
- **Delivered** - Order completed

#### Features:

- Real-time status updates
- Visual progress indicators (completed, active, pending)
- Animated current status indicator
- Cancelled order handling
- Order details display (customer name, product, price, quantity)
- Responsive design

#### Props:

```typescript
interface OrderTimelineProps {
  order: Order
}
```

### 2. Your Orders Page (`app/your-orders/page.tsx`)

A dedicated page for viewing all orders with their live status timelines.

#### Features:

- Order history sidebar with all orders
- Click to select and view detailed timeline
- Auto-polling every 3 seconds for real-time updates
- Status badges with color coding
- Empty state for no orders
- Responsive grid layout

## Status Mapping

The component maps the existing OrderStatus enum to timeline steps:

- `PENDING` → Order Placed (Step 0)
- `ACCEPTED` → Food is Preparing (Step 1)
- `PROCESSING` → Food is Preparing (Step 2)
- `READY_FOR_PICKUP` → Ready for Pickup (Step 3)
- `COMPLETED` → Delivered (Step 4)
- `CANCELLED` → Special cancelled state

## Usage

### Basic Usage:

```tsx
import OrderTimeline from '@/components/OrderTimeline'
;<OrderTimeline order={order} />
```

### In Your Orders Page:

Navigate to `/your-orders` to see all orders with timeline view.

## Styling

- Uses Tailwind CSS for styling
- Includes animations for active states
- Color-coded status indicators
- Responsive design for mobile and desktop

## Icons

Uses `lucide-react` for timeline icons:

- `CheckCircle` - Completed steps
- `Clock` - Current/active step
- `Circle` - Pending steps

## Installation

The lucide-react package has been added as a dependency:

```bash
pnpm add lucide-react
```

## Future Enhancements

To make the timeline more accurate, consider:

1. Extending the OrderStatus enum to include more specific statuses (ACCEPTED, PREPARING, READY)
2. Adding timestamp for each status change
3. Adding estimated time for each step
4. Adding notifications when status changes
5. Adding ability to cancel orders from the timeline view
