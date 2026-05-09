import { gql } from '@apollo/client'

export const ORDER_CREATED_SUBSCRIPTION = gql`
  subscription OnOrderCreated {
    orderCreated {
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

export const ORDER_UPDATED_SUBSCRIPTION = gql`
  subscription OnOrderUpdated($orderId: ID!) {
    orderUpdated:orderStatusUpdated(orderId: $orderId) {
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
