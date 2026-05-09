'use client';

import { useMutation } from '@apollo/client/react';
import { CREATE_ORDER } from '@/lib/graphql/mutation';
import { GET_ALL_ORDERS } from '@/lib/graphql/queries';
import { CreateOrderInput } from '@/types/order';
import { useState ,useEffect} from 'react';
import OrderForm from '@/components/OrderForm';

export default function NewOrdersPage() {
    const [successMessage, setSuccessMessage] = useState('');
    const [createOrder, { loading, error }] = useMutation(CREATE_ORDER, {
        refetchQueries: [{ query:  GET_ALL_ORDERS }],
    });

      // Update document title
      useEffect(() => {
        document.title = 'Food Order - New Order'
      }, [])

    const handleSubmit = async (input: CreateOrderInput) => {
        try {
            await createOrder({
                variables: { input },
            });
            setSuccessMessage('Order created successfully!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            console.error('Error creating order:', err);
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
                Create New Order
            </h1>

            {successMessage && (
                <div className="max-w-2xl mx-auto mb-6">
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                        {successMessage}
                    </div>
                </div>
            )}

            {error && (
                <div className="max-w-2xl mx-auto mb-6">
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        <p>Error creating order.  Please check your GraphQL endpoint.</p>
                        <p className="text-sm mt-2">{error.message}</p>
                    </div>
                </div>
            )}

            <OrderForm onSubmit={handleSubmit} loading={loading} />
        </div>
    );
}