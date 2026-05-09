import { gql } from '@apollo/client';

export const CREATE_ORDER = gql`
    mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
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
`;

export const UPDATE_ORDER_STATUS = gql`
    mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!) {
        updateOrderStatus(id: $id, status: $status) {
            id
            status
        }
    }
`;