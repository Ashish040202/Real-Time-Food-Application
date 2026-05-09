import { ApolloLink, ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import {GraphQLWsLink} from "@apollo/client/link/subscriptions"
import { createClient } from 'graphql-ws';
import { OperationTypeNode } from "graphql";
// Configure the GraphQL Client
const httpLink = new HttpLink({
    uri: process.env. NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
    credentials: 'same-origin',
});

// Subscription
const wsLink = new GraphQLWsLink(
    createClient({
        url: process.env. NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT || "ws://localhost:4000/graphql",
    })
);
const splitLink = ApolloLink.split(
    ({ operationType }) => {
        return operationType === OperationTypeNode.SUBSCRIPTION;
    },
    wsLink,
    httpLink
);

// Without Subscription
// const client = new ApolloClient({
//     link:  httpLink,
//     cache: new InMemoryCache(),
//     defaultOptions: {
//         watchQuery:  {
//             fetchPolicy: 'cache-and-network',
//         },
//     },
// });

const client = new ApolloClient({
    link:  splitLink,
    cache: new InMemoryCache(),
    defaultOptions: {
        watchQuery:  {
            fetchPolicy: 'cache-and-network',
        },
    },
});

export default client;