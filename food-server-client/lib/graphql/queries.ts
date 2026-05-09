import { gql } from '@apollo/client'

export const GET_ALL_ORDERS = gql`
  query GetAllOrders {
    orders {
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
`

export const GET_SELL_ORDERS = gql`
  query GetSellOrders($type: OrderType!) {
    ordersByType(type: $type) {
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
`

export const GET_ORDER_BY_ID = gql`
  query GetOrderById($id: ID!) {
    order(id: $id) {
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
`

export const GET_ORDERS_BY_ORDER_ID = gql`
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
`

export const LIST_ORDER_ITEMS = gql`
  query listOrderItems {
    listOrderItems {
      id
      name
      description
      rate
      category
      available
    }
  }
`
