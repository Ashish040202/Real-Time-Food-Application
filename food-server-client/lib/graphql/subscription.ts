import { gql } from '@apollo/client'

export const ORDER_CREATED_SUBSCRIPTION = gql`
  subscription OnOrderCreated {
    orderCreated {
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

export const NOTIFICATION_SUBSCRIPTION = gql`
  subscription OnNotificationReceived {
    notificationReceived {
      id
      type
      title
      message
      orderId
      read
      createdAt
    }
  }
`

export const ORDER_UPDATED_SUBSCRIPTION = gql`
  subscription OnOrderUpdated($orderId: ID) {
    orderUpdated: orderStatusUpdated(orderId: $orderId) {
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
