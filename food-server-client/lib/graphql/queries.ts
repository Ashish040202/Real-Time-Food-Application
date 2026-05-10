import { gql } from '@apollo/client'

export const ME = gql`
  query Me {
    me {
      id
      name
      email
      role
    }
  }
`

export const GET_ALL_ORDERS = gql`
  query GetAllOrders {
    orders {
      id
      userId
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
      userId
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
      userId
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
  query ListOrderItems {
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
