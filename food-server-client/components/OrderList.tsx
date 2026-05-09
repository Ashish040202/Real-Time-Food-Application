import { Order, OrderStatus } from '@/types/order';
import OrderCard from './OrderCard';

interface OrderListProps {
    orders: Order[];
    loading?:  boolean;
    onStatusChange?: (id: string, status: OrderStatus) => void;
}

export default function OrderList({
                                      orders,
                                      loading,
                                      onStatusChange,
                                  }:  OrderListProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md: grid-cols-2 lg: grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div
                        key={i}
                        className="bg-gray-200 rounded-lg h-64 animate-pulse"
                    ></div>
                ))}
            </div>
        );
    }

    if (orders. length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No orders found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md: grid-cols-2 lg: grid-cols-3 gap-6">
            {orders.map((order) => (
                <OrderCard
                    key={order. id}
                    order={order}
                    onStatusChange={onStatusChange}
                />
            ))}
        </div>
    );
}