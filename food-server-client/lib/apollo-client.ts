import { ApolloClient, InMemoryCache, HttpLink, ApolloLink } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient } from 'graphql-ws'
import { getMainDefinition } from '@apollo/client/utilities'

const GRAPHQL_HTTP =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql'
const GRAPHQL_WS =
  process.env.NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT || 'ws://localhost:4000/graphql'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

const httpLink = new HttpLink({ uri: GRAPHQL_HTTP })

const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  },
}))

const wsLink =
  typeof window !== 'undefined'
    ? new GraphQLWsLink(
        createClient({
          url: () => {
            const token = getToken()
            return token
              ? `${GRAPHQL_WS}?token=${encodeURIComponent(token)}`
              : GRAPHQL_WS
          },
        })
      )
    : null

const link =
  typeof window !== 'undefined' && wsLink
    ? ApolloLink.split(
        ({ query }) => {
          const def = getMainDefinition(query)
          return def.kind === 'OperationDefinition' && def.operation === 'subscription'
        },
        wsLink,
        authLink.concat(httpLink)
      )
    : authLink.concat(httpLink)

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})

export default client
